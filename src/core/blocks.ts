import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome, sanitizeAccountId } from './account-id.js';
import type { Page } from './browser.js';
import { uniqueTempPath, withFileLock } from './file-lock.js';
import { sleep } from './timing.js';
import type { AccountId, Platform } from './types.js';

export type BlockState = 'ok' | 'soft_block' | 'hard_block' | 'challenge_required' | 'quarantined';

export interface BlockRecord {
  platform: Platform;
  accountId: AccountId;
  state: BlockState;
  consecutiveSoftBlocks: number;
  lastBlockedAt?: string;
  quarantinedUntil?: string;
  reason?: string;
}

export interface BlockCheckResult {
  state: BlockState;
  reason?: string;
  waitMs: number;
  quarantinedUntil?: Date;
}

export interface BlockCheckOptions {
  currentHttpStatus?: number;
  extraPhrases?: string[];
  perCheckTimeoutMs?: number;
  now?: number;
  softWindowMs?: number;
  quarantineMs?: number;
}

export interface HumanHandoffOptions extends BlockCheckOptions {
  instructions?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_SOFT_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_QUARANTINE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PER_CHECK_TIMEOUT_MS = 500;
const DEFAULT_HANDOFF_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_HANDOFF_POLL_INTERVAL_MS = 5 * 1000;

const SOFT_BLOCK_PHRASES = [
  'Action Blocked',
  'Try Again Later',
  'We limit how often',
  "You're Temporarily Blocked",
  'rate limit',
  'unusual activity',
  'something went wrong',
  'please try again in',
] as const;

const CHALLENGE_SELECTORS = [
  'iframe[src*="recaptcha"]',
  '#captcha-form',
  '[data-testid*="captcha"]',
  'div[class*="captcha"]',
] as const;

const CHALLENGE_TEXT = ["Verify you're a human", "Verify it's you", 'Security check'] as const;
const LOGIN_REDIRECT_PATTERNS = [
  /\/login\b/i,
  /\/log-in\b/i,
  /\/signin\b/i,
  /\/sign-in\b/i,
  /\/checkpoint\b/i,
] as const;

export function getBlockRecordPath(platform: Platform, accountId: AccountId): string {
  const root = getSignalFireHome();
  const safe = sanitizeAccountId(accountId);
  return path.join(root, 'blocks', platform, `${safe}.json`);
}

function okRecord(platform: Platform, accountId: AccountId): BlockRecord {
  return {
    platform,
    accountId,
    state: 'ok',
    consecutiveSoftBlocks: 0,
  };
}

function waitUntil(quarantinedUntil: string | undefined, now: number): number {
  if (quarantinedUntil === undefined) return 0;
  return Math.max(0, new Date(quarantinedUntil).getTime() - now);
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

export async function readBlockRecord(
  platform: Platform,
  accountId: AccountId,
): Promise<BlockRecord | null> {
  const filePath = getBlockRecordPath(platform, accountId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as BlockRecord;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    if (err instanceof SyntaxError) return null;
    throw err;
  }
}

export async function writeBlockRecord(record: BlockRecord): Promise<void> {
  const filePath = getBlockRecordPath(record.platform, record.accountId);
  await withFileLock(`${filePath}.lock`, async () => {
    await atomicWriteFile(filePath, JSON.stringify(record, null, 2));
  });
}

export async function isAccountQuarantined(
  platform: Platform,
  accountId: AccountId,
  opts?: { now?: number },
): Promise<{ quarantined: boolean; untilMs?: number }> {
  const now = opts?.now ?? Date.now();
  const record = await readBlockRecord(platform, accountId);
  if (record?.state !== 'quarantined') return { quarantined: false };

  const waitMs = waitUntil(record.quarantinedUntil, now);
  if (waitMs > 0) {
    return {
      quarantined: true,
      ...(record.quarantinedUntil !== undefined && {
        untilMs: new Date(record.quarantinedUntil).getTime(),
      }),
    };
  }

  await writeBlockRecord(okRecord(platform, accountId));
  return { quarantined: false };
}

async function isVisible(locator: unknown, timeoutMs: number): Promise<boolean> {
  const maybeLocator = locator as { waitFor?: (options: unknown) => Promise<unknown> };
  if (typeof maybeLocator.waitFor !== 'function') return false;
  try {
    await maybeLocator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

async function findSelector(page: Page, selectors: readonly string[], timeoutMs: number) {
  for (const selector of selectors) {
    try {
      if (await isVisible(page.locator(selector).first(), timeoutMs)) return selector;
    } catch {
      // Locator creation can throw on a closed or mocked page.
    }
  }
  return undefined;
}

async function findText(page: Page, phrases: readonly string[], timeoutMs: number) {
  for (const phrase of phrases) {
    try {
      if (await isVisible(page.getByText(phrase, { exact: false }).first(), timeoutMs)) {
        return phrase;
      }
    } catch {
      // Missing text APIs in tests or transient browser errors mean "not found".
    }
  }
  return undefined;
}

function loginRedirectReason(page: Page): string | undefined {
  try {
    const url = page.url();
    return LOGIN_REDIRECT_PATTERNS.some((pattern) => pattern.test(url))
      ? 'login_redirect'
      : undefined;
  } catch {
    return undefined;
  }
}

function toResult(record: BlockRecord, now: number): BlockCheckResult {
  return {
    state: record.state,
    ...(record.reason !== undefined && { reason: record.reason }),
    waitMs: record.state === 'quarantined' ? waitUntil(record.quarantinedUntil, now) : 0,
    ...(record.quarantinedUntil !== undefined && {
      quarantinedUntil: new Date(record.quarantinedUntil),
    }),
  };
}

function quarantineRecord(
  platform: Platform,
  accountId: AccountId,
  reason: string,
  now: number,
  quarantineMs: number,
): BlockRecord {
  return {
    platform,
    accountId,
    state: 'quarantined',
    consecutiveSoftBlocks: 0,
    lastBlockedAt: new Date(now).toISOString(),
    quarantinedUntil: new Date(now + quarantineMs).toISOString(),
    reason,
  };
}

function softBlockRecord(
  existing: BlockRecord | null,
  platform: Platform,
  accountId: AccountId,
  reason: string,
  now: number,
  softWindowMs: number,
): BlockRecord {
  const lastBlockedAt =
    existing?.lastBlockedAt === undefined ? undefined : new Date(existing.lastBlockedAt).getTime();
  const isRecent =
    existing?.state === 'soft_block' &&
    lastBlockedAt !== undefined &&
    Number.isFinite(lastBlockedAt) &&
    now - lastBlockedAt <= softWindowMs;

  return {
    platform,
    accountId,
    state: 'soft_block',
    consecutiveSoftBlocks: isRecent ? existing.consecutiveSoftBlocks + 1 : 1,
    lastBlockedAt: new Date(now).toISOString(),
    reason,
  };
}

export async function checkPageForBlocks(
  page: Page,
  platform: Platform,
  accountId: AccountId,
  opts?: BlockCheckOptions,
): Promise<BlockCheckResult> {
  const now = opts?.now ?? Date.now();
  const perCheckTimeoutMs = opts?.perCheckTimeoutMs ?? DEFAULT_PER_CHECK_TIMEOUT_MS;
  const softWindowMs = opts?.softWindowMs ?? DEFAULT_SOFT_WINDOW_MS;
  const quarantineMs = opts?.quarantineMs ?? DEFAULT_QUARANTINE_MS;
  const existing = await readBlockRecord(platform, accountId);

  if (existing?.state === 'quarantined') {
    const waitMs = waitUntil(existing.quarantinedUntil, now);
    if (waitMs > 0) return toResult(existing, now);

    const record = okRecord(platform, accountId);
    await writeBlockRecord(record);
    return toResult(record, now);
  }

  const challengeSelector = await findSelector(page, CHALLENGE_SELECTORS, perCheckTimeoutMs);
  const challengeText = await findText(page, CHALLENGE_TEXT, perCheckTimeoutMs);
  const loginRedirect = loginRedirectReason(page);
  if (
    challengeSelector !== undefined ||
    challengeText !== undefined ||
    loginRedirect !== undefined
  ) {
    const reason = challengeSelector ?? challengeText ?? loginRedirect ?? 'challenge_required';
    const record: BlockRecord = {
      platform,
      accountId,
      state: 'challenge_required',
      consecutiveSoftBlocks: existing?.consecutiveSoftBlocks ?? 0,
      lastBlockedAt: new Date(now).toISOString(),
      reason,
    };
    await writeBlockRecord(record);
    return toResult(record, now);
  }

  const phrases = [...SOFT_BLOCK_PHRASES, ...(opts?.extraPhrases ?? [])];
  const softReason =
    opts?.currentHttpStatus === 429 ? 'HTTP 429' : await findText(page, phrases, perCheckTimeoutMs);
  if (softReason !== undefined) {
    const record = softBlockRecord(existing, platform, accountId, softReason, now, softWindowMs);
    if (record.consecutiveSoftBlocks >= 3) {
      const quarantined = quarantineRecord(platform, accountId, softReason, now, quarantineMs);
      await writeBlockRecord(quarantined);
      return toResult(quarantined, now);
    }

    await writeBlockRecord(record);
    return toResult(record, now);
  }

  const record = okRecord(platform, accountId);
  await writeBlockRecord(record);
  return toResult(record, now);
}

export async function humanHandoff(
  platform: Platform,
  accountId: AccountId,
  page: Page,
  opts?: HumanHandoffOptions,
): Promise<BlockCheckResult> {
  const instructions =
    opts?.instructions ??
    `Manual action required for ${platform}/${accountId}. Resolve the visible challenge, then leave the page open.`;
  process.stderr.write(`${instructions}\n`);

  try {
    await page.bringToFront();
  } catch {
    // Some browser/page mocks and closed pages cannot be focused.
  }

  const startedAt = opts?.now ?? Date.now();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_HANDOFF_TIMEOUT_MS;
  const pollIntervalMs = opts?.pollIntervalMs ?? DEFAULT_HANDOFF_POLL_INTERVAL_MS;

  while (Date.now() - startedAt <= timeoutMs) {
    const result = await checkPageForBlocks(page, platform, accountId, opts);
    if (result.state === 'ok') return result;
    await sleep(pollIntervalMs);
  }

  const now = Date.now();
  const record = quarantineRecord(
    platform,
    accountId,
    'human_handoff_timeout',
    now,
    opts?.quarantineMs ?? DEFAULT_QUARANTINE_MS,
  );
  await writeBlockRecord(record);
  return toResult(record, now);
}
