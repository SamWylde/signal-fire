import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome, legacyAccountIdVariants, sanitizeAccountId } from './account-id.js';
import type { BrowserContext } from './browser.js';
import { uniqueTempPath, withFileLock } from './file-lock.js';
import type { AccountId, Platform } from './types.js';

export type SessionMode = 'storageState' | 'userDataDir';

export interface SessionMetadata {
  platform: Platform;
  accountId: AccountId;
  mode: SessionMode;
  lastValidated: string; // ISO 8601 timestamp
  storageStateSha256?: string;
}

export interface SessionPaths {
  storageStatePath: string; // path even if file doesn't exist yet
  metadataPath: string;
  userDataDir: string;
}

export function getSessionPaths(platform: Platform, accountId: AccountId): SessionPaths {
  const root = getSignalFireHome();
  const safe = sanitizeAccountId(accountId);
  return {
    storageStatePath: path.join(root, 'sessions', platform, `${safe}.json`),
    metadataPath: path.join(root, 'sessions', platform, `${safe}.meta.json`),
    userDataDir: path.join(root, 'profiles', safe),
  };
}

function sessionPathsForSafe(platform: Platform, safe: string, userDataSafe = safe): SessionPaths {
  const root = getSignalFireHome();
  return {
    storageStatePath: path.join(root, 'sessions', platform, `${safe}.json`),
    metadataPath: path.join(root, 'sessions', platform, `${safe}.meta.json`),
    userDataDir: path.join(root, 'profiles', userDataSafe),
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveSessionPathsForRead(
  platform: Platform,
  accountId: AccountId,
): Promise<SessionPaths> {
  const canonical = getSessionPaths(platform, accountId);
  if (await pathExists(canonical.metadataPath)) return canonical;

  const canonicalSafe = sanitizeAccountId(accountId);
  for (const variant of legacyAccountIdVariants(accountId)) {
    if (variant === canonicalSafe) continue;
    const paths = sessionPathsForSafe(platform, variant, canonicalSafe);
    if (await pathExists(paths.metadataPath)) return paths;
  }

  return canonical;
}

const ALL_PLATFORMS: Platform[] = [
  'facebook',
  'instagram',
  'x',
  'linkedin',
  'tiktok',
  'youtube',
  'threads',
  'reddit',
  'pinterest',
];

/**
 * Migrates old per-platform Chromium profiles to the new shared per-account path.
 * Idempotent: if the new shared path already exists, does nothing.
 * On first run, picks the most-recently-modified old profile as the canonical one,
 * moves it to profiles/<accountId>/, and archives the rest to profiles-legacy/<platform>-<accountId>/.
 * Logs to stderr what was migrated and what was archived.
 */
export async function migrateProfileDirIfNeeded(
  platform: Platform,
  accountId: AccountId,
): Promise<void> {
  const root = getSignalFireHome();
  const safe = sanitizeAccountId(accountId);
  const safeVariants = legacyAccountIdVariants(accountId);
  const newPath = path.join(root, 'profiles', safe);

  // Idempotent: new shared path already exists — nothing to do.
  try {
    await fs.access(newPath);
    return;
  } catch {
    // new path doesn't exist yet — proceed with migration check
  }

  // Collect all old per-platform profile dirs that actually exist.
  const candidates: Array<{ platform: Platform; dirPath: string; mtimeMs: number }> = [];
  const seenCandidates = new Set<string>();
  for (const p of ALL_PLATFORMS) {
    for (const variant of safeVariants) {
      const oldPath = path.join(root, 'profiles', p, variant);
      if (seenCandidates.has(oldPath)) continue;
      seenCandidates.add(oldPath);
      try {
        const stat = await fs.stat(oldPath);
        if (stat.isDirectory()) {
          candidates.push({ platform: p, dirPath: oldPath, mtimeMs: stat.mtimeMs });
        }
      } catch {
        // doesn't exist — skip
      }
    }
  }

  if (candidates.length === 0) return;

  // Pick the most recently modified profile as the canonical one.
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const winner = candidates[0];
  if (winner === undefined) return;
  const losers = candidates.slice(1);

  // Move winner to the new shared path.
  await fs.mkdir(path.dirname(newPath), { recursive: true });
  await fs.rename(winner.dirPath, newPath);
  process.stderr.write(`[signal-fire] migrated profile: ${winner.dirPath} → ${newPath}\n`);

  // Archive the losers to profiles-legacy/.
  for (const loser of losers) {
    const legacyPath = path.join(
      root,
      'profiles-legacy',
      `${loser.platform}-${path.basename(loser.dirPath)}`,
    );
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.rename(loser.dirPath, legacyPath);
    process.stderr.write(
      `[signal-fire] archived legacy profile: ${loser.dirPath} → ${legacyPath}\n`,
    );
  }
}

export async function hasPersistentProfile(
  platform: Platform,
  accountId: AccountId,
): Promise<boolean> {
  const paths = getSessionPaths(platform, accountId);
  if (await pathExists(paths.userDataDir)) return true;

  const root = getSignalFireHome();
  for (const variant of legacyAccountIdVariants(accountId)) {
    const legacyPath = path.join(root, 'profiles', platform, variant);
    if (await pathExists(legacyPath)) return true;
  }

  return false;
}

export async function ensureSignalFireDir(): Promise<string> {
  const root = getSignalFireHome();
  await fs.mkdir(root, { recursive: true });
  return root;
}

export async function readMetadata(
  platform: Platform,
  accountId: AccountId,
): Promise<SessionMetadata | null> {
  const { metadataPath } = await resolveSessionPathsForRead(platform, accountId);
  try {
    const raw = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(raw) as SessionMetadata;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  const tmpPath = uniqueTempPath(filePath);
  let handle: fs.FileHandle | undefined;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    handle = await fs.open(tmpPath, 'wx');
    await handle.writeFile(data, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function storageStateSha256(filePath: string): Promise<string> {
  const raw = await fs.readFile(filePath);
  return createHash('sha256').update(raw).digest('hex');
}

async function isStorageStateTrusted(paths: SessionPaths, meta: SessionMetadata): Promise<boolean> {
  if (meta.storageStateSha256 === undefined) return false;
  try {
    return (await storageStateSha256(paths.storageStatePath)) === meta.storageStateSha256;
  } catch {
    return false;
  }
}

export async function writeMetadata(meta: SessionMetadata): Promise<void> {
  const { metadataPath } = getSessionPaths(meta.platform, meta.accountId);
  await atomicWriteFile(metadataPath, JSON.stringify(meta, null, 2));
}

export async function isSessionFresh(platform: Platform, accountId: AccountId): Promise<boolean> {
  const paths = await resolveSessionPathsForRead(platform, accountId);
  let meta: SessionMetadata;
  try {
    meta = JSON.parse(await fs.readFile(paths.metadataPath, 'utf8')) as SessionMetadata;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  if (meta.mode === 'storageState' && !(await isStorageStateTrusted(paths, meta))) return false;
  if (meta.mode === 'userDataDir') {
    try {
      await fs.access(paths.userDataDir);
    } catch {
      return false;
    }
  }
  return true;
}

export async function saveStorageState(
  context: BrowserContext,
  platform: Platform,
  accountId: AccountId,
): Promise<void> {
  const { storageStatePath, metadataPath } = getSessionPaths(platform, accountId);
  await withFileLock(`${storageStatePath}.lock`, async () => {
    const state = await context.storageState();
    await atomicWriteFile(storageStatePath, JSON.stringify(state, null, 2));
    const now = new Date().toISOString();
    const meta: SessionMetadata = {
      platform,
      accountId,
      mode: 'storageState',
      lastValidated: now,
      storageStateSha256: await storageStateSha256(storageStatePath),
    };
    await atomicWriteFile(metadataPath, JSON.stringify(meta, null, 2));
  });
}

export async function markUserDataDirValidated(
  platform: Platform,
  accountId: AccountId,
): Promise<void> {
  const meta: SessionMetadata = {
    platform,
    accountId,
    mode: 'userDataDir',
    lastValidated: new Date().toISOString(),
  };
  await writeMetadata(meta);
}

export async function loadSessionOverrides(
  platform: Platform,
  accountId: AccountId,
): Promise<{ userDataDir?: string; storageStatePath?: string }> {
  const paths = await resolveSessionPathsForRead(platform, accountId);
  let meta: SessionMetadata;
  try {
    meta = JSON.parse(await fs.readFile(paths.metadataPath, 'utf8')) as SessionMetadata;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
  const result: { userDataDir?: string; storageStatePath?: string } = {};
  if (meta.mode === 'userDataDir') {
    try {
      await fs.access(paths.userDataDir);
      result.userDataDir = paths.userDataDir;
    } catch {
      // dir doesn't exist — return empty
    }
  } else if (meta.mode === 'storageState') {
    if (await isStorageStateTrusted(paths, meta)) {
      result.storageStatePath = paths.storageStatePath;
    }
  }
  return result;
}

export async function clearSession(platform: Platform, accountId: AccountId): Promise<void> {
  const canonicalSafe = sanitizeAccountId(accountId);
  await Promise.all(
    legacyAccountIdVariants(accountId).map(async (safe) => {
      const paths = sessionPathsForSafe(platform, safe, canonicalSafe);
      await Promise.all([
        fs.rm(paths.storageStatePath, { force: true }),
        fs.rm(paths.metadataPath, { force: true }),
      ]);
    }),
  );
}
