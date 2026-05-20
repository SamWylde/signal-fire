import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome, sanitizeAccountId } from './account-id.js';
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
  for (const p of ALL_PLATFORMS) {
    const oldPath = path.join(root, 'profiles', p, safe);
    try {
      const stat = await fs.stat(oldPath);
      if (stat.isDirectory()) {
        candidates.push({ platform: p, dirPath: oldPath, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // doesn't exist — skip
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
    const legacyPath = path.join(root, 'profiles-legacy', `${loser.platform}-${safe}`);
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.rename(loser.dirPath, legacyPath);
    process.stderr.write(
      `[signal-fire] archived legacy profile: ${loser.dirPath} → ${legacyPath}\n`,
    );
  }
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
  const { metadataPath } = getSessionPaths(platform, accountId);
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

export async function isSessionFresh(
  platform: Platform,
  accountId: AccountId,
  maxAgeHours = 24,
): Promise<boolean> {
  const meta = await readMetadata(platform, accountId);
  if (meta === null) return false;
  const paths = getSessionPaths(platform, accountId);
  if (meta.mode === 'storageState' && !(await isStorageStateTrusted(paths, meta))) return false;
  if (meta.mode === 'userDataDir') {
    try {
      await fs.access(paths.userDataDir);
    } catch {
      return false;
    }
  }
  const lastValidated = new Date(meta.lastValidated).getTime();
  const ageMs = Date.now() - lastValidated;
  return ageMs < maxAgeHours * 60 * 60 * 1000;
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
    const existingMeta = await readMetadata(platform, accountId);
    const meta: SessionMetadata = {
      platform,
      accountId,
      mode: 'storageState',
      lastValidated: now,
      storageStateSha256: await storageStateSha256(storageStatePath),
      ...(existingMeta !== null && {
        platform: existingMeta.platform,
        accountId: existingMeta.accountId,
      }),
    };
    await atomicWriteFile(metadataPath, JSON.stringify(meta, null, 2));
  });
}

export async function markUserDataDirValidated(
  platform: Platform,
  accountId: AccountId,
): Promise<void> {
  const existing = await readMetadata(platform, accountId);
  const meta: SessionMetadata = {
    platform,
    accountId,
    mode: 'userDataDir',
    lastValidated: new Date().toISOString(),
    ...(existing !== null && {
      platform: existing.platform,
      accountId: existing.accountId,
    }),
  };
  await writeMetadata(meta);
}

export async function loadSessionOverrides(
  platform: Platform,
  accountId: AccountId,
): Promise<{ userDataDir?: string; storageStatePath?: string }> {
  const meta = await readMetadata(platform, accountId);
  if (meta === null) return {};
  const paths = getSessionPaths(platform, accountId);
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
  const paths = getSessionPaths(platform, accountId);
  await Promise.all([
    fs.rm(paths.storageStatePath, { force: true }),
    fs.rm(paths.metadataPath, { force: true }),
  ]);
}
