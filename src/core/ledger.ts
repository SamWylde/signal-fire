import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome, sanitizeAccountId } from './account-id.js';
import { uniqueTempPath, withFileLock } from './file-lock.js';
import type { AccountId, Platform } from './types.js';

export interface LedgerEntry {
  action: string;
  time: number;
  ok: boolean;
  target?: string;
  meta?: Record<string, unknown>;
}

export function getLedgerPath(platform: Platform, accountId: AccountId): string {
  const root = getSignalFireHome();
  const safe = sanitizeAccountId(accountId);
  return path.join(root, 'ledger', platform, `${safe}.json`);
}

export async function readLedger(platform: Platform, accountId: AccountId): Promise<LedgerEntry[]> {
  const filePath = getLedgerPath(platform, accountId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as LedgerEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    // SyntaxError or other read errors also return []
    if (err instanceof SyntaxError) return [];
    throw err;
  }
}

export async function appendLedger(
  platform: Platform,
  accountId: AccountId,
  entry: LedgerEntry,
): Promise<void> {
  const filePath = getLedgerPath(platform, accountId);
  await withFileLock(`${filePath}.lock`, async () => {
    const tmpPath = uniqueTempPath(filePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const entries = await readLedger(platform, accountId);
    entries.push(entry);
    await fs.writeFile(tmpPath, JSON.stringify(entries), 'utf8');
    await fs.rename(tmpPath, filePath);
  });
}

export async function recordAction(
  platform: Platform,
  accountId: AccountId,
  action: string,
  opts?: { ok?: boolean; target?: string; meta?: Record<string, unknown> },
): Promise<void> {
  const entry: LedgerEntry = {
    action,
    time: Date.now(),
    ok: opts?.ok ?? true,
    ...(opts?.target !== undefined && { target: opts.target }),
    ...(opts?.meta !== undefined && { meta: opts.meta }),
  };
  await appendLedger(platform, accountId, entry);
}

export async function countRecent(
  platform: Platform,
  accountId: AccountId,
  action: string,
  windowMs: number,
  options?: { countFailed?: boolean },
): Promise<number> {
  const entries = await readLedger(platform, accountId);
  const now = Date.now();
  const countFailed = options?.countFailed ?? false;
  return entries.filter(
    (e) => e.action === action && now - e.time < windowMs && (countFailed || e.ok),
  ).length;
}

export async function pruneLedger(
  platform: Platform,
  accountId: AccountId,
  keepMs: number,
): Promise<number> {
  const filePath = getLedgerPath(platform, accountId);
  return withFileLock(`${filePath}.lock`, async () => {
    const entries = await readLedger(platform, accountId);
    const now = Date.now();
    const kept = entries.filter((e) => now - e.time < keepMs);
    const dropped = entries.length - kept.length;
    if (dropped > 0) {
      const tmpPath = uniqueTempPath(filePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(tmpPath, JSON.stringify(kept), 'utf8');
      await fs.rename(tmpPath, filePath);
    }
    return dropped;
  });
}
