/**
 * Selector Audit Tool
 *
 * Audits whether selectors in src/platforms/<platform>/selectors.ts still match
 * current site UIs, using the same persistent browser session the app uses.
 *
 * Usage:
 *   pnpm audit-selectors -- --account <accountId> [--platform <name>] [--no-keep-open]
 */

import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { chromium } from 'patchright';
import type { BrowserContext, Page } from 'patchright';

import { applyFingerprintEvasions } from '../src/core/evasions/index.js';
import {
  chromeMajorFromUA,
  loadOrCreateFingerprint,
  registerChromeMajorDetector,
} from '../src/core/fingerprint.js';
import { getSessionPaths } from '../src/core/session.js';

import { isLoggedIn as isFacebookLoggedIn } from '../src/platforms/facebook/auth.js';
import { FACEBOOK } from '../src/platforms/facebook/selectors.js';
import { isLoggedIn as isInstagramLoggedIn } from '../src/platforms/instagram/auth.js';
import { INSTAGRAM } from '../src/platforms/instagram/selectors.js';
import { isLoggedIn as isLinkedInLoggedIn } from '../src/platforms/linkedin/auth.js';
import { LINKEDIN } from '../src/platforms/linkedin/selectors.js';
import { isLoggedIn as isTikTokLoggedIn } from '../src/platforms/tiktok/auth.js';
import { TIKTOK } from '../src/platforms/tiktok/selectors.js';
import { isLoggedIn as isXLoggedIn } from '../src/platforms/x/auth.js';
import { X } from '../src/platforms/x/selectors.js';
import { isLoggedIn as isYouTubeLoggedIn } from '../src/platforms/youtube/auth.js';
import { YOUTUBE } from '../src/platforms/youtube/selectors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditPlatform = 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'x' | 'youtube';

interface Candidate {
  tag: string;
  text: string;
  aria: string | null;
  role: string | null;
  testid: string | null;
  dataE2e: string | null;
  href: string | null;
  selector: string;
  screenshot?: string;
}

interface SelectorResult {
  path: string;
  selector: string;
  status: 'match' | 'miss';
  count: number;
  screenshots: string[];
  candidates?: Candidate[];
}

interface AuditReport {
  platform: AuditPlatform;
  accountId: string;
  timestamp: string;
  url: string;
  isLoggedIn: boolean;
  screenshotDir: string;
  selectorResults: SelectorResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_PLATFORMS: AuditPlatform[] = [
  'facebook',
  'instagram',
  'linkedin',
  'tiktok',
  'x',
  'youtube',
];

const COMPOSER_URLS: Record<AuditPlatform, string> = {
  facebook: 'https://www.facebook.com/',
  instagram: 'https://www.instagram.com/',
  linkedin: 'https://www.linkedin.com/feed/',
  tiktok: 'https://www.tiktok.com/upload',
  x: 'https://x.com/home',
  youtube: 'https://studio.youtube.com/',
};

const BASE_LAUNCH_ARGS = ['--mute-audio'] as const;

const IGNORE_DEFAULT_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--enable-automation',
] as const;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  accountId: string;
  platform: AuditPlatform | null;
  keepOpen: boolean;
  screenshots: boolean;
} {
  const args = process.argv.slice(2);
  let accountId: string | undefined;
  let platform: AuditPlatform | null = null;
  let keepOpen = true;
  let screenshots = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--account' && args[i + 1] !== undefined) {
      accountId = args[i + 1];
      i++;
    } else if (arg === '--platform' && args[i + 1] !== undefined) {
      const p = args[i + 1] as string;
      if (!AUDIT_PLATFORMS.includes(p as AuditPlatform)) {
        console.error(`Unknown platform: ${p}. Valid: ${AUDIT_PLATFORMS.join(', ')}`);
        process.exit(1);
      }
      platform = p as AuditPlatform;
      i++;
    } else if (arg === '--no-keep-open') {
      keepOpen = false;
    } else if (arg === '--no-screenshots') {
      screenshots = false;
    }
  }

  if (accountId === undefined || accountId.trim().length === 0) {
    console.error('Error: --account <accountId> is required.');
    console.error(
      'Usage: pnpm audit-selectors -- --account <accountId> [--platform <name>] [--no-keep-open] [--no-screenshots]',
    );
    process.exit(1);
  }

  return { accountId: accountId.trim(), platform, keepOpen, screenshots };
}

// ---------------------------------------------------------------------------
// Chrome detection (mirrors browser.ts pattern)
// ---------------------------------------------------------------------------

let loggedChromeDetection = false;

function chromeExecutableCandidates(): string[] {
  return [
    path.join(process.env.ProgramFiles ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] ?? '',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    // Hardcoded Windows fallbacks (defense in depth, in case env vars aren't set)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter((p) => p.length > 'chrome.exe'.length); // drop empty-prefix entries
}

function findChromeExecutable(): string | null {
  const candidates = chromeExecutableCandidates();
  const results: Array<{ path: string; exists: boolean; error?: string }> = [];
  let found: string | undefined;
  for (const candidate of candidates) {
    try {
      const exists = fsSync.existsSync(candidate);
      results.push({ path: candidate, exists });
      if (exists && found === undefined) found = candidate;
    } catch (err) {
      results.push({
        path: candidate,
        exists: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const chromePath = found ?? null;
  if (!loggedChromeDetection) {
    loggedChromeDetection = true;
    process.stderr.write(
      `[signal-fire] Chrome detection: ${chromePath === null ? 'NOT FOUND' : chromePath}\n`,
    );
    for (const r of results) {
      process.stderr.write(
        `  ${r.exists ? '✓' : '✗'} ${r.path}${r.error ? ` (error: ${r.error})` : ''}\n`,
      );
    }
  }
  return chromePath;
}

function chromeMajorFromVersion(version: string | null): number | null {
  if (version === null) return null;
  const match = version.match(/^(\d+)\./);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

function getInstalledChromeVersion(): string | null {
  const executablePath = findChromeExecutable();
  if (executablePath === null) return null;
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const output = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      timeout: 1500,
      windowsHide: true,
    });
    return (output as string).match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function chromeUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

// ---------------------------------------------------------------------------
// Browser launch (minimal duplicate of browser.ts, no quarantine/block checks)
// ---------------------------------------------------------------------------

async function launchAuditBrowser(accountId: string): Promise<BrowserContext> {
  if (findChromeExecutable() === null) {
    throw new Error(
      'Google Chrome is required for signal-fire stealth mode.\n' +
        'Install Chrome from https://www.google.com/chrome and restart.',
    );
  }

  registerChromeMajorDetector(async () => chromeMajorFromVersion(getInstalledChromeVersion()));

  const fingerprint = await loadOrCreateFingerprint(accountId);

  // Normalize UA to installed Chrome major
  const detectedMajor = chromeMajorFromVersion(getInstalledChromeVersion());
  const persistedMajor = chromeMajorFromUA(fingerprint.userAgent);
  const normalizedFingerprint =
    detectedMajor !== null && persistedMajor !== detectedMajor
      ? { ...fingerprint, userAgent: chromeUserAgent(detectedMajor) }
      : fingerprint;

  // Use the account-level (platform-agnostic) userDataDir.
  // getSessionPaths needs a platform; 'linkedin' is used as a representative since
  // userDataDir is per-account (not per-platform) after the migration in session.ts.
  const paths = getSessionPaths('linkedin', accountId);
  const userDataDir = paths.userDataDir;

  // Detect if the app currently holds the lock on this profile.
  // Patchright throws with a profile-in-use message if Chrome is already running there.
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      chromiumSandbox: true,
      ignoreDefaultArgs: [...IGNORE_DEFAULT_ARGS],
      args: [...BASE_LAUNCH_ARGS],
      acceptDownloads: false,
      viewport: null,
      locale: normalizedFingerprint.locale,
      timezoneId: normalizedFingerprint.timezoneId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('user data directory is already in use') ||
      msg.includes('already being used') ||
      msg.includes('SingletonLock') ||
      msg.includes('DevToolsActivePort')
    ) {
      throw new Error(
        `The app appears to be running with this account's profile. Close the app and retry.\n(${msg})`,
      );
    }
    throw err;
  }

  await applyFingerprintEvasions(context, normalizedFingerprint);
  return context;
}

// ---------------------------------------------------------------------------
// isLoggedIn dispatch
// ---------------------------------------------------------------------------

async function checkIsLoggedIn(platform: AuditPlatform, page: Page): Promise<boolean> {
  switch (platform) {
    case 'linkedin':
      return isLinkedInLoggedIn(page);
    case 'facebook':
      return isFacebookLoggedIn(page);
    case 'instagram':
      return isInstagramLoggedIn(page);
    case 'x':
      return isXLoggedIn(page);
    case 'tiktok':
      return isTikTokLoggedIn(page);
    case 'youtube':
      return isYouTubeLoggedIn(page);
  }
}

// ---------------------------------------------------------------------------
// Selector flattening
// ---------------------------------------------------------------------------

type SelectorMap = Record<string, unknown>;

function flattenSelectors(obj: SelectorMap, prefix = ''): Array<[string, string]> {
  const results: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      results.push([fullKey, value]);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      results.push(...flattenSelectors(value as SelectorMap, fullKey));
    }
    // Arrays (e.g. visibilityOptions) and non-string primitives are skipped
  }
  return results;
}

function getSelectorsForPlatform(platform: AuditPlatform): Array<[string, string]> {
  switch (platform) {
    case 'linkedin':
      return flattenSelectors(LINKEDIN.selectors as unknown as SelectorMap, 'selectors');
    case 'facebook':
      return flattenSelectors(FACEBOOK.selectors as unknown as SelectorMap, 'selectors');
    case 'instagram':
      return flattenSelectors(INSTAGRAM.selectors as unknown as SelectorMap, 'selectors');
    case 'x':
      return flattenSelectors(X.selectors as unknown as SelectorMap, 'selectors');
    case 'tiktok':
      return flattenSelectors(TIKTOK.selectors as unknown as SelectorMap, 'selectors');
    case 'youtube':
      return flattenSelectors(YOUTUBE.selectors as unknown as SelectorMap, 'selectors');
  }
}

// ---------------------------------------------------------------------------
// Intent inference
// ---------------------------------------------------------------------------

function inferIntent(selectorPath: string): string {
  const leaf = selectorPath.split('.').pop() ?? selectorPath;
  if (/post|tweet|share|publish|upload/i.test(leaf)) return 'postButton';
  if (/input|editor|textarea|text|caption|description/i.test(leaf)) return 'composerInput';
  if (/trigger|start|create|compose|new/i.test(leaf)) return 'composerTrigger';
  if (/image|photo|media|attach|file/i.test(leaf)) return 'attachImage';
  if (/logged|indicator|nav|profile|home|avatar/i.test(leaf)) return 'loggedInIndicator';
  return leaf;
}

// ---------------------------------------------------------------------------
// Screenshot helpers
// ---------------------------------------------------------------------------

function sanitizePath(selectorPath: string): string {
  return selectorPath.replace(/[.[\]'"/ ]/g, '_');
}

async function highlightAndScreenshot(
  page: Page,
  selector: string,
  intent: string,
  status: 'match' | 'candidate',
  candidateIndex: number | null,
  screenshotPath: string,
): Promise<void> {
  const color = status === 'match' ? '#00cc66' : '#cc3300';
  const bgColor = status === 'match' ? 'rgba(0, 204, 102, 0.3)' : 'rgba(204, 51, 0, 0.3)';

  await page.evaluate(
    ({ sel, intentText, statusText, c, bg }) => {
      try {
        const el = document.querySelector(sel);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          el.style.outline = `4px solid ${c}`;
          el.style.outlineOffset = '2px';
          el.style.boxShadow = `0 0 0 8px ${bg}`;
          (el as HTMLElement & { __auditMarked?: boolean }).__auditMarked = true;
        }
        const banner = document.createElement('div');
        banner.id = '__sf_audit_banner';
        banner.style.cssText = `position:fixed;top:0;left:0;z-index:2147483647;background:#000;color:#fff;font-family:monospace;font-size:13px;padding:8px 12px;max-width:90vw;border:2px solid ${c};white-space:pre`;
        banner.textContent = `${statusText.toUpperCase()}: ${intentText}\n${sel}`;
        document.body.appendChild(banner);
      } catch {
        /* swallow */
      }
    },
    { sel: selector, intentText: intent, statusText: status, c: color, bg: bgColor },
  );

  await page.waitForTimeout(250);

  await page.screenshot({ path: screenshotPath, fullPage: false });

  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      if ((el as HTMLElement & { __auditMarked?: boolean }).__auditMarked) {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
        (el as HTMLElement & { __auditMarked?: boolean }).__auditMarked = undefined;
      }
    }
    document.getElementById('__sf_audit_banner')?.remove();
  });
}

// ---------------------------------------------------------------------------
// Heuristic candidate finder (runs in browser context)
// ---------------------------------------------------------------------------

async function findCandidates(page: Page, intent: string): Promise<Candidate[]> {
  return page.evaluate((intentArg: string): Candidate[] => {
    const intentKeywords: Record<string, RegExp> = {
      postButton: /post|tweet|share|publish|upload/i,
      composerInput: /what'?s|share|message|post|tweet/i,
      composerTrigger: /start a post|what'?s on|create|new post/i,
      attachImage: /photo|image|media|attach/i,
      loggedInIndicator: /(start a post|post|tweet|home|messaging|notifications)/i,
    };

    const keyRegex = intentKeywords[intentArg] ?? /.{0,100}/;

    function cssPath(el: Element): string {
      if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
      const testid = el.getAttribute('data-testid');
      if (testid) return `${el.tagName.toLowerCase()}[data-testid='${testid}']`;
      const dataE2e = el.getAttribute('data-e2e');
      if (dataE2e) return `${el.tagName.toLowerCase()}[data-e2e='${dataE2e}']`;
      const aria = el.getAttribute('aria-label');
      if (aria) return `${el.tagName.toLowerCase()}[aria-label='${aria.replace(/'/g, "\\'")}']`;
      return el.tagName.toLowerCase();
    }

    const candidates: Candidate[] = [];
    const els = document.querySelectorAll(
      'button, [role="button"], textarea, [contenteditable="true"], a, div[aria-label]',
    );
    for (const el of els) {
      const text = (el.textContent ?? '').trim().slice(0, 80);
      const aria = el.getAttribute('aria-label');
      const role = el.getAttribute('role');
      const testid = el.getAttribute('data-testid');
      const dataE2e = el.getAttribute('data-e2e');
      const href = el.getAttribute('href');
      const matches =
        keyRegex.test(text) ||
        (aria !== null && keyRegex.test(aria)) ||
        (testid !== null && keyRegex.test(testid)) ||
        (dataE2e !== null && keyRegex.test(dataE2e));
      if (!matches) continue;
      candidates.push({
        tag: el.tagName.toLowerCase(),
        text,
        aria,
        role,
        testid,
        dataE2e,
        href,
        selector: cssPath(el),
      });
    }

    return candidates.slice(0, 10);
  }, intent);
}

// ---------------------------------------------------------------------------
// Report persistence
// ---------------------------------------------------------------------------

function getSignalFireRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

async function writeReport(report: AuditReport): Promise<string> {
  const dir = path.join(getSignalFireRoot(), 'audit-reports');
  await fs.mkdir(dir, { recursive: true });
  const ts = report.timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `${ts}-${report.platform}.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// Per-platform audit
// ---------------------------------------------------------------------------

async function auditPlatform(
  platform: AuditPlatform,
  accountId: string,
  context: BrowserContext,
  screenshots: boolean,
  screenshotDir: string,
): Promise<AuditReport> {
  const url = COMPOSER_URLS[platform];
  const timestamp = new Date().toISOString();

  const page = context.pages()[0] ?? (await context.newPage());

  console.log(`\n[${platform}] Checking login status...`);
  const loggedIn = await checkIsLoggedIn(platform, page);

  if (!loggedIn) {
    console.warn(`[${platform}] WARNING: Not logged in. Skipping selector checks.`);
    return {
      platform,
      accountId,
      timestamp,
      url,
      isLoggedIn: false,
      screenshotDir,
      selectorResults: [],
    };
  }

  console.log(`[${platform}] Logged in. Navigating to ${url} ...`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.warn(`[${platform}] networkidle timeout — continuing with current DOM`);
    });
  } catch (err) {
    console.warn(
      `[${platform}] Navigation error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const selectorPairs = getSelectorsForPlatform(platform);
  console.log(`[${platform}] Testing ${selectorPairs.length} selectors...`);

  const selectorResults: SelectorResult[] = [];

  for (const [selectorPath, selector] of selectorPairs) {
    let count = 0;
    try {
      count = await page.locator(selector).count();
    } catch {
      // Invalid selector — treat as miss
      count = 0;
    }

    const status: 'match' | 'miss' = count >= 1 ? 'match' : 'miss';
    const result: SelectorResult = { path: selectorPath, selector, status, count, screenshots: [] };

    if (status === 'miss') {
      const intent = inferIntent(selectorPath);
      let candidates: Candidate[] = [];
      try {
        candidates = await findCandidates(page, intent);
      } catch {
        // Candidate search failing is non-fatal
      }

      if (candidates.length > 0) {
        const topCandidates = candidates.slice(0, 3);
        if (screenshots) {
          const annotated: Candidate[] = [];
          for (const [i, cand] of topCandidates.entries()) {
            const filename = `${sanitizePath(selectorPath)}-candidate-${i + 1}.png`;
            const screenshotPath = path.join(screenshotDir, filename);
            try {
              await highlightAndScreenshot(
                page,
                cand.selector,
                selectorPath,
                'candidate',
                i,
                screenshotPath,
              );
              annotated.push({ ...cand, screenshot: filename });
            } catch (err) {
              console.warn(
                `  [screenshot] Failed for candidate ${i + 1} of ${selectorPath}: ${err instanceof Error ? err.message : String(err)}`,
              );
              annotated.push(cand);
            }
          }
          result.candidates = [...annotated, ...candidates.slice(3)];
        } else {
          result.candidates = candidates;
        }
      }

      console.log(`  MISS  ${selectorPath}`);
    } else {
      if (screenshots) {
        const filename = `${sanitizePath(selectorPath)}.png`;
        const screenshotPath = path.join(screenshotDir, filename);
        try {
          await highlightAndScreenshot(page, selector, selectorPath, 'match', null, screenshotPath);
          result.screenshots.push(filename);
        } catch (err) {
          console.warn(
            `  [screenshot] Failed for ${selectorPath}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      console.log(`  MATCH ${selectorPath} (${count})`);
    }

    selectorResults.push(result);
  }

  return {
    platform,
    accountId,
    timestamp,
    url,
    isLoggedIn: true,
    screenshotDir,
    selectorResults,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { accountId, platform, keepOpen, screenshots } = parseArgs();

  const platformsToAudit: AuditPlatform[] = platform !== null ? [platform] : AUDIT_PLATFORMS;

  // Build a single timestamp slug for this run's screenshot directory
  const runTs = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  const screenshotBase = path.join(
    getSignalFireRoot(),
    'audit-reports',
    `${runTs}-${platformsToAudit[0] ?? 'audit'}`,
  );
  if (screenshots) {
    await fs.mkdir(screenshotBase, { recursive: true });
  }

  console.log('\nsignal-fire selector audit');
  console.log(`  Account    : ${accountId}`);
  console.log(`  Platforms  : ${platformsToAudit.join(', ')}`);
  console.log(`  Keep open  : ${keepOpen}`);
  console.log(`  Screenshots: ${screenshots ? screenshotBase : 'disabled'}`);

  console.log('\nLaunching browser...');
  const context = await launchAuditBrowser(accountId);

  const reports: AuditReport[] = [];

  try {
    for (const p of platformsToAudit) {
      // Each platform gets its own subdirectory under the run directory
      const platformScreenshotDir = path.join(screenshotBase, p);
      if (screenshots) {
        await fs.mkdir(platformScreenshotDir, { recursive: true });
      }
      const report = await auditPlatform(p, accountId, context, screenshots, platformScreenshotDir);
      reports.push(report);
      const reportPath = await writeReport(report);
      const matchCount = report.selectorResults.filter((r) => r.status === 'match').length;
      const missCount = report.selectorResults.filter((r) => r.status === 'miss').length;
      console.log(`\n[${p}] Done. Match: ${matchCount}, Miss: ${missCount}`);
      console.log(`[${p}] Report: ${reportPath}`);
    }
  } finally {
    if (!keepOpen) {
      await context.close();
    } else {
      console.log('\n--- Browser left open for manual inspection ---');
      console.log('Open DevTools with F12. Press Ctrl+C to exit.');
      // Keep the process alive until Ctrl+C
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          context
            .close()
            .catch(() => undefined)
            .finally(resolve);
        });
        process.on('SIGTERM', () => {
          context
            .close()
            .catch(() => undefined)
            .finally(resolve);
        });
      });
    }
  }

  // Summary
  console.log('\n=== Audit Summary ===');
  for (const r of reports) {
    if (!r.isLoggedIn) {
      console.log(`${r.platform}: NOT LOGGED IN (skipped)`);
      continue;
    }
    const matches = r.selectorResults.filter((s) => s.status === 'match').length;
    const misses = r.selectorResults.filter((s) => s.status === 'miss').length;
    console.log(`${r.platform}: ${matches} match, ${misses} miss`);
    for (const s of r.selectorResults.filter((sr) => sr.status === 'miss')) {
      console.log(`  MISS: ${s.path}`);
      if (s.candidates !== undefined && s.candidates.length > 0) {
        console.log(`    Candidates: ${s.candidates.map((c) => c.selector).join(', ')}`);
      }
    }
  }
}

main().catch((err) => {
  console.error('Audit failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
