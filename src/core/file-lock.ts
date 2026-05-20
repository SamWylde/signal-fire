import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { sleep } from './timing.js';

interface FileLockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_STALE_MS = 60_000;
const RETRYABLE_LOCK_CODES = new Set(['EEXIST', 'EACCES', 'EPERM']);

interface LockFileMetadata {
  pid?: number;
  ownerId?: string;
  createdAt?: string;
}

export function uniqueTempPath(targetPath: string): string {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  return `${targetPath}.${suffix}.tmp`;
}

function makeOwnerId(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM';
  }
}

async function readLockMetadata(lockPath: string): Promise<LockFileMetadata | null> {
  try {
    const raw = await fs.readFile(lockPath, 'utf8');
    return JSON.parse(raw) as LockFileMetadata;
  } catch {
    return null;
  }
}

async function removeLockPath(lockPath: string, ownerId?: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (ownerId !== undefined) {
        const metadata = await readLockMetadata(lockPath);
        if (metadata !== null && metadata.ownerId !== ownerId) return;
      }
      await fs.rm(lockPath, { force: true });
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') && attempt < 4) {
        await sleep(20 + attempt * 30);
        continue;
      }
      throw err;
    }
  }
}

async function shouldRemoveStaleLock(lockPath: string, staleMs: number): Promise<boolean> {
  const stat = await fs.stat(lockPath);
  if (Date.now() - stat.mtimeMs <= staleMs) return false;

  const metadata = await readLockMetadata(lockPath);
  if (metadata?.pid !== undefined && isProcessAlive(metadata.pid)) return false;
  return true;
}

export async function withFileLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options?.staleMs ?? DEFAULT_STALE_MS;
  const startedAt = Date.now();
  const ownerId = makeOwnerId();

  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  let handle: fs.FileHandle | undefined;
  while (handle === undefined) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out waiting for file lock: ${lockPath}`);
    }

    try {
      handle = await fs.open(lockPath, 'wx');
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, ownerId, createdAt: new Date().toISOString() }),
          'utf8',
        );
      } catch (writeErr) {
        await handle.close().catch(() => undefined);
        handle = undefined;
        await removeLockPath(lockPath, ownerId).catch(() => undefined);
        throw writeErr;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === undefined || !RETRYABLE_LOCK_CODES.has(code)) throw err;

      if (code === 'EEXIST') {
        try {
          if (await shouldRemoveStaleLock(lockPath, staleMs)) {
            await removeLockPath(lockPath);
            continue;
          }
        } catch (statErr) {
          if ((statErr as NodeJS.ErrnoException).code !== 'ENOENT') throw statErr;
        }
      }

      const remainingMs = timeoutMs - (Date.now() - startedAt);
      if (remainingMs <= 0) {
        throw new Error(`Timed out waiting for file lock: ${lockPath}`);
      }

      await sleep(Math.min(20 + Math.floor(Math.random() * 30), remainingMs));
    }
  }

  try {
    return await fn();
  } finally {
    await handle.close();
    await removeLockPath(lockPath, ownerId);
  }
}
