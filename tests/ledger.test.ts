import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendLedger,
  countRecent,
  getLedgerPath,
  pruneLedger,
  readLedger,
  recordAction,
} from '../src/core/ledger.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-ledger-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('getLedgerPath', () => {
  it('returns path rooted at SIGNAL_FIRE_HOME under ledger/<platform>/<accountId>.json', () => {
    const p = getLedgerPath('instagram', 'myUser');
    expect(p).toContain('ledger');
    expect(p).toContain('instagram');
    expect(p).toContain('myUser.json');
  });

  it('sanitizes unsafe characters in accountId', () => {
    const p = getLedgerPath('tiktok', 'weird/name@host');
    expect(p).toContain('weird_name@host.json');
  });
});

describe('readLedger', () => {
  it('returns [] when file does not exist', async () => {
    const entries = await readLedger('tiktok', 'nobody');
    expect(entries).toEqual([]);
  });
});

describe('recordAction + readLedger roundtrip', () => {
  it('persists a recorded action', async () => {
    await recordAction('instagram', 'user1', 'post', { ok: true, target: 'https://ig.com/p/1' });
    const entries = await readLedger('instagram', 'user1');
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.action).toBe('post');
    expect(entry?.ok).toBe(true);
    expect(entry?.target).toBe('https://ig.com/p/1');
    expect(typeof entry?.time).toBe('number');
  });

  it('appends multiple entries', async () => {
    await recordAction('tiktok', 'creator', 'post');
    await recordAction('tiktok', 'creator', 'post');
    await recordAction('tiktok', 'creator', 'like');
    const entries = await readLedger('tiktok', 'creator');
    expect(entries).toHaveLength(3);
  });

  it('records ok: true by default', async () => {
    await recordAction('x', 'user2', 'follow');
    const entries = await readLedger('x', 'user2');
    expect(entries[0]?.ok).toBe(true);
  });

  it('records ok: false when specified', async () => {
    await recordAction('x', 'user2', 'follow', { ok: false });
    const entries = await readLedger('x', 'user2');
    expect(entries[0]?.ok).toBe(false);
  });
});

describe('appendLedger concurrency', () => {
  it('serializes concurrent writes without dropping entries', async () => {
    const writes = Array.from({ length: 20 }, (_, i) =>
      appendLedger('x', 'race', {
        action: 'post',
        time: i,
        ok: true,
      }),
    );

    const results = await Promise.allSettled(writes);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const entries = await readLedger('x', 'race');
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((e) => e.time)).size).toBe(20);
  });
});

describe('appendLedger', () => {
  it('stores optional target and meta fields', async () => {
    await appendLedger('linkedin', 'biz', {
      action: 'comment',
      time: Date.now(),
      ok: true,
      target: 'post-123',
      meta: { length: 42 },
    });
    const entries = await readLedger('linkedin', 'biz');
    expect(entries[0]?.target).toBe('post-123');
    expect(entries[0]?.meta).toEqual({ length: 42 });
  });
});

describe('countRecent', () => {
  it('counts only entries within the time window', async () => {
    const now = Date.now();
    const thirtyMinAgo = now - 30 * 60 * 1000;

    await appendLedger('instagram', 'acc', { action: 'like', time: thirtyMinAgo, ok: true });

    // 60-min window: 30min-ago entry is within range → count 1
    const count60 = await countRecent('instagram', 'acc', 'like', 60 * 60 * 1000);
    expect(count60).toBe(1);

    // 15-min window: 30min-ago entry is outside → count 0
    const count15 = await countRecent('instagram', 'acc', 'like', 15 * 60 * 1000);
    expect(count15).toBe(0);
  });

  it('excludes ok: false entries by default (countFailed defaults to false)', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'acc2', { action: 'follow', time: now - 1000, ok: false });
    await appendLedger('instagram', 'acc2', { action: 'follow', time: now - 2000, ok: true });

    const count = await countRecent('instagram', 'acc2', 'follow', 60 * 60 * 1000);
    expect(count).toBe(1);
  });

  it('includes ok: false entries when countFailed: true', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'acc3', { action: 'follow', time: now - 1000, ok: false });
    await appendLedger('instagram', 'acc3', { action: 'follow', time: now - 2000, ok: true });

    const count = await countRecent('instagram', 'acc3', 'follow', 60 * 60 * 1000, {
      countFailed: true,
    });
    expect(count).toBe(2);
  });

  it('counts only the specified action', async () => {
    const now = Date.now();
    await appendLedger('tiktok', 'creator2', { action: 'post', time: now - 1000, ok: true });
    await appendLedger('tiktok', 'creator2', { action: 'like', time: now - 2000, ok: true });

    expect(await countRecent('tiktok', 'creator2', 'post', 60 * 60 * 1000)).toBe(1);
    expect(await countRecent('tiktok', 'creator2', 'like', 60 * 60 * 1000)).toBe(1);
    expect(await countRecent('tiktok', 'creator2', 'follow', 60 * 60 * 1000)).toBe(0);
  });
});

describe('pruneLedger', () => {
  it('drops old entries and returns the dropped count', async () => {
    const now = Date.now();
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    const thirtyMinAgo = now - 30 * 60 * 1000;

    await appendLedger('reddit', 'user', { action: 'post', time: twoHoursAgo, ok: true });
    await appendLedger('reddit', 'user', { action: 'post', time: thirtyMinAgo, ok: true });
    await appendLedger('reddit', 'user', { action: 'post', time: now - 1000, ok: true });

    // keep only entries within the last hour
    const dropped = await pruneLedger('reddit', 'user', 60 * 60 * 1000);
    expect(dropped).toBe(1);

    const remaining = await readLedger('reddit', 'user');
    expect(remaining).toHaveLength(2);
  });

  it('returns 0 and is a no-op when nothing is old enough to prune', async () => {
    const now = Date.now();
    await appendLedger('reddit', 'user2', { action: 'post', time: now - 1000, ok: true });

    const dropped = await pruneLedger('reddit', 'user2', 60 * 60 * 1000);
    expect(dropped).toBe(0);

    const remaining = await readLedger('reddit', 'user2');
    expect(remaining).toHaveLength(1);
  });

  it('returns 0 when ledger does not exist', async () => {
    const dropped = await pruneLedger('reddit', 'ghost', 60 * 60 * 1000);
    expect(dropped).toBe(0);
  });
});
