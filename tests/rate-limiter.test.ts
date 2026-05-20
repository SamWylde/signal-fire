import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appendLedger } from '../src/core/ledger.js';
import { checkAllLimits, checkLimit } from '../src/core/rate-limiter.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-rl-test-'));
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

describe('checkLimit — no entries', () => {
  it('returns withinLimits=true when no actions recorded', async () => {
    const result = await checkLimit('instagram', 'acc', 'post', { perHour: 5 });
    expect(result.withinLimits).toBe(true);
    expect(result.recommendedWaitMs).toBe(0);
  });
});

describe('checkLimit — perHour breach', () => {
  it('returns withinLimits=false and breachedWindow=hour when hourly cap hit', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await appendLedger('instagram', 'acc', {
        action: 'like',
        time: now - (i + 1) * 60 * 1000, // 1-5 min ago
        ok: true,
      });
    }

    const result = await checkLimit('instagram', 'acc', 'like', { perHour: 5 });
    expect(result.withinLimits).toBe(false);
    expect(result.breachedWindow).toBe('hour');
    expect(result.breachedAction).toBe('like');
    expect(result.recommendedWaitMs).toBeGreaterThan(0);
    expect(result.recommendedWaitMs).toBeGreaterThan(54 * 60 * 1000);
    expect(result.recommendedWaitMs).toBeLessThanOrEqual(55 * 60 * 1000);
  });
});

describe('checkLimit — perDay breach', () => {
  it('returns breachedWindow=day when daily cap hit', async () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      await appendLedger('tiktok', 'creator', {
        action: 'follow',
        time: now - (i + 1) * 60 * 60 * 1000, // 1-10 hours ago (within 24h)
        ok: true,
      });
    }

    const result = await checkLimit('tiktok', 'creator', 'follow', { perDay: 10 });
    expect(result.withinLimits).toBe(false);
    expect(result.breachedWindow).toBe('day');
    expect(result.breachedAction).toBe('follow');
  });
});

describe('checkLimit — perWindow (custom) breach', () => {
  it('returns breachedWindow=custom when custom window cap hit', async () => {
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      await appendLedger('x', 'user', {
        action: 'comment',
        time: now - (i + 1) * 10 * 1000, // 10s and 20s ago (within 60s)
        ok: true,
      });
    }

    const result = await checkLimit('x', 'user', 'comment', {
      perWindow: { ms: 60_000, max: 2 },
    });
    expect(result.withinLimits).toBe(false);
    expect(result.breachedWindow).toBe('custom');
  });
});

describe('checkLimit — passes when under all limits', () => {
  it('returns withinLimits=true when perHour and perDay both under cap', async () => {
    const now = Date.now();
    // 3 entries within last hour, cap is 5
    for (let i = 0; i < 3; i++) {
      await appendLedger('linkedin', 'biz', {
        action: 'post',
        time: now - (i + 1) * 10 * 60 * 1000,
        ok: true,
      });
    }

    const result = await checkLimit('linkedin', 'biz', 'post', {
      perHour: 5,
      perDay: 20,
    });
    expect(result.withinLimits).toBe(true);
    expect(result.recommendedWaitMs).toBe(0);
  });
});

describe('recommendedWaitMs', () => {
  it('returns the full wait needed for the window to open', async () => {
    const now = Date.now();
    // entry at now - 30min, perHour: 1 → raw wait = 30min, cooldownMs = 10min
    await appendLedger('instagram', 'clamp1', {
      action: 'post',
      time: now - 30 * 60 * 1000,
      ok: true,
    });

    const result = await checkLimit('instagram', 'clamp1', 'post', { perHour: 1 });
    expect(result.withinLimits).toBe(false);
    expect(result.recommendedWaitMs).toBeGreaterThan(29 * 60 * 1000);
    expect(result.recommendedWaitMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('does NOT clamp when raw wait is less than cooldownMs', async () => {
    const now = Date.now();
    // entry at now - 59min30s, perHour: 1 → raw wait = ~30s, cooldownMs = 10min
    await appendLedger('instagram', 'clamp2', {
      action: 'post',
      time: now - (59 * 60 * 1000 + 30 * 1000),
      ok: true,
    });

    const result = await checkLimit('instagram', 'clamp2', 'post', { perHour: 1 });
    expect(result.withinLimits).toBe(false);
    // raw wait ≈ 30s; should be approximately 30s (allow ±2s)
    expect(result.recommendedWaitMs).toBeGreaterThan(28 * 1000);
    expect(result.recommendedWaitMs).toBeLessThan(32 * 1000);
  });

  it('uses cooldownMs as a minimum wait when provided', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'cooldown-floor', {
      action: 'post',
      time: now - (59 * 60 * 1000 + 30 * 1000),
      ok: true,
    });

    const result = await checkLimit(
      'instagram',
      'cooldown-floor',
      'post',
      { perHour: 1 },
      { cooldownMs: 10 * 60 * 1000 },
    );

    expect(result.withinLimits).toBe(false);
    expect(result.recommendedWaitMs).toBe(10 * 60 * 1000);
  });
});

describe('checkLimit — shared source action groups', () => {
  it('can count multiple action names against one shared limit', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'shared-actions', {
      action: 'follow',
      time: now - 10 * 60 * 1000,
      ok: true,
    });
    await appendLedger('instagram', 'shared-actions', {
      action: 'unfollow',
      time: now - 5 * 60 * 1000,
      ok: true,
    });

    const result = await checkLimit('instagram', 'shared-actions', 'follow', {
      perHour: 2,
      actions: ['unfollow'],
    });

    expect(result.withinLimits).toBe(false);
    expect(result.breachedWindow).toBe('hour');
  });

  it('ignores noActionTaken ledger entries by default', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'no-action', {
      action: 'follow',
      time: now - 10 * 60 * 1000,
      ok: true,
    });
    await appendLedger('instagram', 'no-action', {
      action: 'unfollow',
      time: now - 5 * 60 * 1000,
      ok: true,
      meta: { noActionTaken: true },
    });

    const result = await checkLimit('instagram', 'no-action', 'follow', {
      perHour: 2,
      actions: ['unfollow'],
    });

    expect(result.withinLimits).toBe(true);
  });

  it('can include noActionTaken entries when explicitly configured', async () => {
    const now = Date.now();
    await appendLedger('instagram', 'count-no-action', {
      action: 'follow',
      time: now - 10 * 60 * 1000,
      ok: true,
    });
    await appendLedger('instagram', 'count-no-action', {
      action: 'unfollow',
      time: now - 5 * 60 * 1000,
      ok: true,
      meta: { noActionTaken: true },
    });

    const result = await checkLimit('instagram', 'count-no-action', 'follow', {
      perHour: 2,
      actions: ['unfollow'],
      excludeNoActionTaken: false,
    });

    expect(result.withinLimits).toBe(false);
  });
});

describe('checkLimit — countFailed option', () => {
  it('excludes failed entries by default', async () => {
    const now = Date.now();
    // 5 failed entries — should not count against perHour: 5
    for (let i = 0; i < 5; i++) {
      await appendLedger('instagram', 'failacc', {
        action: 'like',
        time: now - (i + 1) * 60 * 1000,
        ok: false,
      });
    }

    const result = await checkLimit('instagram', 'failacc', 'like', { perHour: 5 });
    expect(result.withinLimits).toBe(true);
  });

  it('counts failed entries when countFailed: true', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await appendLedger('instagram', 'failacc2', {
        action: 'like',
        time: now - (i + 1) * 60 * 1000,
        ok: false,
      });
    }

    const result = await checkLimit(
      'instagram',
      'failacc2',
      'like',
      { perHour: 5 },
      {
        countFailed: true,
      },
    );
    expect(result.withinLimits).toBe(false);
    expect(result.breachedWindow).toBe('hour');
  });
});

describe('checkAllLimits', () => {
  it('returns withinLimits=true when action has no configured limits', async () => {
    const result = await checkAllLimits('tiktok', 'user', { post: { perHour: 5 } }, 'like');
    expect(result.withinLimits).toBe(true);
  });

  it('delegates to checkLimit for a configured action', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await appendLedger('tiktok', 'user', {
        action: 'post',
        time: now - (i + 1) * 60 * 1000,
        ok: true,
      });
    }

    const result = await checkAllLimits('tiktok', 'user', { post: { perHour: 5 } }, 'post');
    expect(result.withinLimits).toBe(false);
    expect(result.breachedAction).toBe('post');
  });
});
