// Live, read-only connection health-check.
//
// For an (account, platform) this opens the account's persistent browser profile,
// confirms the saved session is still authenticated, and — only if it is — runs a
// strictly non-publishing composer probe to confirm the composer surface still
// resolves. It NEVER posts, types, uploads, schedules, or writes a block record. The
// only state it ever writes is `lastValidated`, and only when live authentication
// actually succeeds.
//
// This is deliberately separate from the metadata-only `/api/session/verify` flow,
// which marks a session "validated" without launching a browser at all.

import * as fs from 'node:fs/promises';

import { type BlockRecord, readBlockRecord } from './blocks.js';
import type { Page } from './browser.js';
import { launchBrowser } from './browser.js';
import { createLogger } from './logging.js';
import { classifyBlockSignal } from './safety-patterns.js';
import { getSessionPaths, markUserDataDirValidated, readMetadata } from './session.js';
import { type AccountId, POSTING_PLATFORMS, type PostingPlatform } from './types.js';

const log = createLogger('connection-check');

/** Session states, aligned to the existing `BlockState` vocabulary plus diagnostics. */
export type SessionState =
  | 'authenticated'
  | 'logged_out'
  | 'challenge_required'
  | 'soft_block'
  | 'quarantined'
  | 'missing_profile'
  | 'unknown';

export type ComposerState = 'ok' | 'drifted' | 'skipped' | 'unknown';

/** Returned by each platform's read-only `probeComposer`. */
export interface ComposerProbe {
  composer: 'ok' | 'drifted' | 'unknown';
  checkedSelectors: string[];
  missingSelectors: string[];
  detail?: string;
}

export interface ConnectionCheckResult {
  platform: PostingPlatform;
  accountId: AccountId;
  session: SessionState;
  composer: ComposerState;
  checkedAt: string; // ISO 8601
  url?: string;
  reason?: string;
  evidence?: string;
  missingSelectors?: string[];
}

export interface ConnectionCheckOptions {
  spoofFingerprint?: boolean;
}

// --- Pure classification ----------------------------------------------------------

/**
 * Classify the session from observations of the landed page. Pure and IO-free so it
 * can be unit-tested without a browser. Quarantine and missing-profile are decided
 * before launch and are not handled here.
 */
export function classifySessionFromPage(obs: {
  loggedIn: boolean;
  url: string;
  pageText: string;
}): { session: SessionState; reason?: string; evidence?: string } {
  // A challenge/block page is more specific than cookie-only authentication.
  const signal = classifyBlockSignal(`${obs.url}\n${obs.pageText}`);
  if (signal !== null) {
    return {
      session: signal.state,
      reason:
        signal.state === 'challenge_required'
          ? 'Account requires a manual challenge/verification before it can post'
          : 'Platform is temporarily throttling this account',
      evidence: `matched "${signal.phrase}"`,
    };
  }

  if (obs.loggedIn) return { session: 'authenticated' };

  // `isLoggedIn` already checks redirect-to-login, auth cookies, and login chrome, so a
  // false here with no block signal means the session is simply logged out.
  if (/\/login\b|\/log-in\b|\/i\/flow\/login\b|\/signin\b|\/sign-in\b/i.test(obs.url)) {
    return { session: 'logged_out', reason: 'Redirected to the platform login page' };
  }
  return { session: 'logged_out', reason: 'Saved session is no longer authenticated' };
}

function isQuarantineActive(block: BlockRecord, now: number): boolean {
  if (block.state !== 'quarantined') return false;
  if (block.quarantinedUntil === undefined) return true; // indefinite
  return new Date(block.quarantinedUntil).getTime() > now;
}

async function userDataDirExists(
  platform: PostingPlatform,
  accountId: AccountId,
): Promise<boolean> {
  try {
    const stat = await fs.stat(getSessionPaths(platform, accountId).userDataDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// --- Browser driver (injectable for tests) ----------------------------------------

interface LiveSession {
  page: Page;
  close: () => Promise<void>;
}

/**
 * The live-browser interactions, factored out so tests can replace them with fakes and
 * exercise the orchestration/classification without launching Chrome. The real driver
 * launches the persistent profile and dynamically imports each platform's auth/health
 * modules (mirroring the UI's `verifyLogin`).
 */
export interface ConnectionCheckDriver {
  open: (
    platform: PostingPlatform,
    accountId: AccountId,
    opts: ConnectionCheckOptions,
  ) => Promise<LiveSession>;
  isLoggedIn: (platform: PostingPlatform, page: Page) => Promise<boolean>;
  readPageState: (page: Page) => Promise<{ url: string; pageText: string }>;
  probeComposer: (platform: PostingPlatform, page: Page) => Promise<ComposerProbe>;
}

const defaultDriver: ConnectionCheckDriver = {
  async open(platform, accountId, opts) {
    const launched = await launchBrowser({
      platform,
      accountId,
      ...(opts.spoofFingerprint !== undefined && { spoofFingerprint: opts.spoofFingerprint }),
      skipQuarantineCheck: true,
    });
    const page = launched.context.pages()[0] ?? (await launched.context.newPage());
    return { page, close: launched.close };
  },
  async isLoggedIn(platform, page) {
    const mod = (await import(`../platforms/${platform}/auth.js`)) as {
      isLoggedIn?: (p: Page) => Promise<boolean>;
    };
    return (await mod.isLoggedIn?.(page)) === true;
  },
  async readPageState(page) {
    let url = '';
    try {
      url = page.url();
    } catch {
      // page may be closed/navigating; treat as empty
    }
    let pageText = '';
    try {
      pageText = await page.evaluate(() => document.body?.innerText ?? '');
    } catch {
      // evaluate can fail mid-navigation; classification falls back to URL only
    }
    return { url, pageText };
  },
  async probeComposer(platform, page) {
    const mod = (await import(`../platforms/${platform}/health.js`)) as {
      probeComposer?: (p: Page) => Promise<ComposerProbe>;
    };
    if (mod.probeComposer === undefined) {
      return {
        composer: 'unknown',
        checkedSelectors: [],
        missingSelectors: [],
        detail: 'No composer probe implemented for this platform',
      };
    }
    return mod.probeComposer(page);
  },
};

let driverOverride: ConnectionCheckDriver | null = null;

/** Test hook — inject a fake driver to run checks without a real browser. */
export function setConnectionCheckDriverForTests(driver: ConnectionCheckDriver | null): void {
  driverOverride = driver;
}

// --- Orchestration ----------------------------------------------------------------

/** Run a single live connection check for one (platform, account). */
export async function runConnectionCheck(
  platform: PostingPlatform,
  accountId: AccountId,
  opts: ConnectionCheckOptions = {},
): Promise<ConnectionCheckResult> {
  const checkedAt = new Date().toISOString();
  const base = { platform, accountId, checkedAt } as const;

  // 1. No saved session — nothing to probe, don't launch a browser.
  const meta = await readMetadata(platform, accountId);
  if (meta === null) {
    return {
      ...base,
      session: 'missing_profile',
      composer: 'skipped',
      reason: 'No saved session for this account on this platform',
    };
  }
  // 2. Quarantined — surface it read-only (never clears or writes the block record).
  const block = await readBlockRecord(platform, accountId);
  if (block !== null && isQuarantineActive(block, Date.now())) {
    return {
      ...base,
      session: 'quarantined',
      composer: 'skipped',
      reason: block.reason ?? 'Account is quarantined after a prior block',
      ...(block.quarantinedUntil !== undefined && {
        evidence: `quarantined until ${block.quarantinedUntil}`,
      }),
    };
  }
  if (!(await userDataDirExists(platform, accountId))) {
    return {
      ...base,
      session: 'missing_profile',
      composer: 'skipped',
      reason: 'Saved session metadata exists, but no persistent browser profile was found',
    };
  }

  // 3. Live, read-only probe.
  const driver = driverOverride ?? defaultDriver;
  let live: LiveSession | null = null;
  try {
    live = await driver.open(platform, accountId, opts);
    const loggedIn = await driver.isLoggedIn(platform, live.page);
    const { url, pageText } = await driver.readPageState(live.page);
    const cls = classifySessionFromPage({ loggedIn, url, pageText });

    if (cls.session !== 'authenticated') {
      return {
        ...base,
        session: cls.session,
        composer: 'skipped',
        ...(url !== '' && { url }),
        ...(cls.reason !== undefined && { reason: cls.reason }),
        ...(cls.evidence !== undefined && { evidence: cls.evidence }),
      };
    }

    // Authenticated is the ONLY path that writes lastValidated.
    await markUserDataDirValidated(platform, accountId).catch((err: unknown) => {
      log.error('Failed to mark session validated:', err);
    });

    // A composer-probe failure must not downgrade a confirmed-authenticated session.
    let probe: ComposerProbe;
    try {
      probe = await driver.probeComposer(platform, live.page);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Composer probe failed for ${platform}/${accountId}:`, message);
      probe = { composer: 'unknown', checkedSelectors: [], missingSelectors: [], detail: message };
    }
    return {
      ...base,
      session: 'authenticated',
      composer: probe.composer,
      ...(url !== '' && { url }),
      ...(probe.detail !== undefined && { reason: probe.detail }),
      ...(probe.missingSelectors.length > 0 && { missingSelectors: probe.missingSelectors }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Connection check failed for ${platform}/${accountId}:`, message);
    return { ...base, session: 'unknown', composer: 'unknown', reason: message };
  } finally {
    if (live !== null) {
      try {
        await live.close();
      } catch {
        // best-effort close
      }
    }
  }
}

/**
 * Run checks for an account across several platforms. Sequential on purpose: the
 * account's Chromium profile is shared across platforms, so only one browser can hold
 * it at a time.
 */
export async function runConnectionChecks(
  accountId: AccountId,
  platforms?: readonly PostingPlatform[],
  opts: ConnectionCheckOptions = {},
): Promise<ConnectionCheckResult[]> {
  const list = platforms ?? POSTING_PLATFORMS;
  const results: ConnectionCheckResult[] = [];
  for (const platform of list) {
    results.push(await runConnectionCheck(platform, accountId, opts));
  }
  return results;
}
