import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { withFileLock } from '../src/core/file-lock.js';
import { sleep } from '../src/core/timing.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-lock-test-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

function lockPath(name = 'resource.lock'): string {
  return path.join(tmpDir, name);
}

async function writeLock(filePath: string, metadata: unknown, mtime = new Date()): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(metadata), 'utf8');
  await fsp.utimes(filePath, mtime, mtime);
}

describe('withFileLock', () => {
  it('acquires, releases, and removes the lock file', async () => {
    const filePath = lockPath();
    const result = await withFileLock(filePath, async () => 'done');

    expect(result).toBe('done');
    await expect(fsp.access(filePath)).rejects.toThrow();
  });

  it('serializes concurrent waiters', async () => {
    const filePath = lockPath();
    let active = 0;
    let maxActive = 0;

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        withFileLock(filePath, async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await sleep(10);
          active--;
          return index;
        }),
      ),
    );

    expect(results.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxActive).toBe(1);
  });

  it('times out instead of acquiring after the deadline', async () => {
    const filePath = lockPath();
    await writeLock(filePath, { pid: process.pid, ownerId: 'live' });

    await expect(
      withFileLock(filePath, async () => 'should-not-run', { timeoutMs: 40, staleMs: 10_000 }),
    ).rejects.toThrow('Timed out waiting for file lock');
  });

  it('recovers an old lock whose owner process is gone', async () => {
    const filePath = lockPath();
    const old = new Date(Date.now() - 60_000);
    await writeLock(filePath, { pid: 999_999_999, ownerId: 'dead' }, old);

    await expect(
      withFileLock(filePath, async () => 'recovered', { timeoutMs: 500, staleMs: 1 }),
    ).resolves.toBe('recovered');
    await expect(fsp.access(filePath)).rejects.toThrow();
  });

  it('does not steal an old lock from a live owner process', async () => {
    const filePath = lockPath();
    const old = new Date(Date.now() - 60_000);
    await writeLock(filePath, { pid: process.pid, ownerId: 'live' }, old);

    await expect(
      withFileLock(filePath, async () => 'should-not-run', { timeoutMs: 40, staleMs: 1 }),
    ).rejects.toThrow('Timed out waiting for file lock');

    const raw = await fsp.readFile(filePath, 'utf8');
    expect(raw).toContain('"ownerId":"live"');
  });
});
