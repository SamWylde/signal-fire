import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkPageForBlocks,
  isAccountQuarantined,
  readBlockRecord,
  writeBlockRecord,
} from '../src/core/blocks.js';
import type { Page } from '../src/core/browser.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

function mockPage(visibleText: string[] = [], visibleSelectors: string[] = []): Page {
  const waitForText = (text: string) =>
    visibleText.some((value) => value.toLowerCase().includes(text.toLowerCase()))
      ? Promise.resolve()
      : Promise.reject(new Error(`Text not visible: ${text}`));
  const waitForSelector = (selector: string) =>
    visibleSelectors.includes(selector)
      ? Promise.resolve()
      : Promise.reject(new Error(`Selector not visible: ${selector}`));

  return {
    getByText: (text: string) => ({
      first: () => ({
        waitFor: () => waitForText(text),
      }),
    }),
    locator: (selector: string) => ({
      first: () => ({
        waitFor: () => waitForSelector(selector),
      }),
    }),
    bringToFront: () => Promise.resolve(),
  } as unknown as Page;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-blocks-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  vi.useRealTimers();
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('checkPageForBlocks', () => {
  it('transitions OK to SOFT_BLOCK on phrase match', async () => {
    const now = Date.UTC(2026, 0, 1, 12);
    const result = await checkPageForBlocks(mockPage(['Action Blocked']), 'instagram', 'creator', {
      now,
    });

    expect(result).toEqual({
      state: 'soft_block',
      reason: 'Action Blocked',
      waitMs: 0,
    });

    const record = await readBlockRecord('instagram', 'creator');
    expect(record).toMatchObject({
      platform: 'instagram',
      accountId: 'creator',
      state: 'soft_block',
      consecutiveSoftBlocks: 1,
      lastBlockedAt: new Date(now).toISOString(),
      reason: 'Action Blocked',
    });
  });

  it('escalates SOFT_BLOCK to QUARANTINED after three soft blocks within six hours', async () => {
    const page = mockPage(['Try Again Later']);
    const platform = 'x';
    const accountId = 'creator';
    const start = Date.UTC(2026, 0, 1, 8);

    await checkPageForBlocks(page, platform, accountId, { now: start });
    await checkPageForBlocks(page, platform, accountId, { now: start + 60 * 60 * 1000 });
    const result = await checkPageForBlocks(page, platform, accountId, {
      now: start + 2 * 60 * 60 * 1000,
    });

    const quarantinedUntil = new Date(start + 26 * 60 * 60 * 1000).toISOString();
    expect(result).toEqual({
      state: 'quarantined',
      reason: 'Try Again Later',
      waitMs: 24 * 60 * 60 * 1000,
      quarantinedUntil: new Date(quarantinedUntil),
    });

    const record = await readBlockRecord(platform, accountId);
    expect(record).toMatchObject({
      state: 'quarantined',
      consecutiveSoftBlocks: 0,
      lastBlockedAt: new Date(start + 2 * 60 * 60 * 1000).toISOString(),
      quarantinedUntil,
      reason: 'Try Again Later',
    });
  });

  it('expires quarantine to OK when checked after quarantinedUntil', async () => {
    const platform = 'linkedin';
    const accountId = 'biz';
    const quarantinedAt = Date.UTC(2026, 0, 1, 9);
    const quarantinedUntil = new Date(quarantinedAt + 24 * 60 * 60 * 1000).toISOString();

    await writeBlockRecord({
      platform,
      accountId,
      state: 'quarantined',
      consecutiveSoftBlocks: 0,
      lastBlockedAt: new Date(quarantinedAt).toISOString(),
      quarantinedUntil,
      reason: 'HTTP 429',
    });

    expect(await isAccountQuarantined(platform, accountId, { now: quarantinedAt + 1000 })).toEqual({
      quarantined: true,
      untilMs: new Date(quarantinedUntil).getTime(),
    });

    const result = await checkPageForBlocks(mockPage(), platform, accountId, {
      now: quarantinedAt + 25 * 60 * 60 * 1000,
    });

    expect(result).toEqual({ state: 'ok', waitMs: 0 });
    expect(
      await isAccountQuarantined(platform, accountId, {
        now: quarantinedAt + 25 * 60 * 60 * 1000,
      }),
    ).toEqual({ quarantined: false });
    expect(await readBlockRecord(platform, accountId)).toMatchObject({
      state: 'ok',
      consecutiveSoftBlocks: 0,
    });
  });
});
