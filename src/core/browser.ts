import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { createLogger } from './logging.js';

const log = createLogger('browser');

import type { BrowserContext, Locator, Page } from 'patchright';

type PatchrightModule = typeof import('patchright');
let _chromium: PatchrightModule['chromium'] | undefined;
async function getChromium(): Promise<PatchrightModule['chromium']> {
  if (_chromium === undefined) {
    _chromium = (await import('patchright')).chromium;
  }
  return _chromium;
}

export type { BrowserContext, Page, Locator };

import { isAccountQuarantined } from './blocks.js';
import { applyFingerprintEvasions } from './evasions/index.js';
import {
  type AccountFingerprint,
  chromeMajorFromUA,
  loadOrCreateFingerprint,
  registerChromeMajorDetector,
} from './fingerprint.js';
import { getSessionPaths, migrateProfileDirIfNeeded } from './session.js';
import type { AccountId, Platform } from './types.js';

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
  bypass?: string;
}

export interface LaunchOptions {
  accountId: AccountId;
  platform: Platform;
  /** @deprecated Patchright stealth mode is always headed; ignored. */
  headless?: boolean | 'new';
  /** @deprecated Patchright stealth mode always uses real Google Chrome; ignored. */
  browserChannel?: BrowserChannel | 'bundled';
  slowMo?: number;
  acceptDownloads?: boolean;
  /** When true, apply the generated per-account fingerprint. Defaults to real-machine mode. */
  spoofFingerprint?: boolean;
  extraArgs?: string[];
  /** @deprecated UA overrides break native UA / Client Hints coherence; ignored. */
  debugUserAgent?: string;
  /** @deprecated Viewport overrides are detectable under Patchright; ignored. */
  debugViewport?: { width: number; height: number };
}

export interface LaunchedBrowser {
  context: BrowserContext;
  fingerprint?: AccountFingerprint;
  close: () => Promise<void>;
}

const BASE_LAUNCH_ARGS = [
  // Patchright already injects --no-first-run and --no-default-browser-check via its own
  // chromiumSwitches. Keep only flags that patchright does not supply.
  '--mute-audio', // Genuine UX need: prevents audio from sites popping up during automation.
  '--start-minimized', // Launch minimized so the browser doesn't steal focus from the user.
] as const;

type BrowserChannel =
  | 'chrome'
  | 'chrome-beta'
  | 'chrome-dev'
  | 'chrome-canary'
  | 'msedge'
  | 'msedge-beta'
  | 'msedge-dev'
  | 'msedge-canary';

let cachedChromePath: string | null | undefined;
let cachedChromeVersion: string | null | undefined;
const warnedLaunchOptions = new Set<string>();
let loggedChromeDetection = false;

function buildLaunchArgs(extraArgs?: string[]): string[] {
  return [...BASE_LAUNCH_ARGS, ...(extraArgs ?? [])];
}

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

export function findChromeExecutable(): string | null {
  if (cachedChromePath !== undefined) return cachedChromePath;
  const candidates = chromeExecutableCandidates();
  const results: Array<{ path: string; exists: boolean; error?: string }> = [];
  let found: string | undefined;
  for (const candidate of candidates) {
    try {
      const exists = fs.existsSync(candidate);
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
  cachedChromePath = found ?? null;
  if (!loggedChromeDetection) {
    loggedChromeDetection = true;
    log.info(`Chrome detection: ${cachedChromePath === null ? 'NOT FOUND' : cachedChromePath}`);
    for (const r of results) {
      log.info(`  ${r.exists ? '✓' : '✗'} ${r.path}${r.error ? ` (error: ${r.error})` : ''}`);
    }
  }
  return cachedChromePath;
}

function readVersionFromChromeDirectory(executablePath: string): string | null {
  try {
    const versionDirs = fs
      .readdirSync(path.dirname(executablePath), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    return versionDirs[0] ?? null;
  } catch {
    return null;
  }
}

function readVersionFromChromeCommand(executablePath: string): string | null {
  try {
    const output = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      timeout: 1500,
      windowsHide: true,
    });
    return output.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function getInstalledChromeVersion(): string | null {
  if (cachedChromeVersion !== undefined) return cachedChromeVersion;
  const executablePath = findChromeExecutable();
  if (executablePath === null) {
    cachedChromeVersion = null;
    return cachedChromeVersion;
  }
  cachedChromeVersion =
    readVersionFromChromeDirectory(executablePath) ?? readVersionFromChromeCommand(executablePath);
  return cachedChromeVersion;
}

function resolveBrowserChannel(requested?: BrowserChannel | 'bundled'): BrowserChannel {
  if (requested !== undefined && requested !== 'chrome') {
    warnOnce(
      'browserChannel',
      `Ignoring browserChannel=${String(requested)}; Patchright stealth mode requires channel=chrome.`,
    );
  }

  const envChannel = process.env.SIGNAL_FIRE_BROWSER_CHANNEL?.trim();
  if (envChannel !== undefined && envChannel.length > 0 && envChannel.toLowerCase() !== 'chrome') {
    warnOnce(
      'SIGNAL_FIRE_BROWSER_CHANNEL',
      `Ignoring SIGNAL_FIRE_BROWSER_CHANNEL=${envChannel}; Patchright stealth mode requires channel=chrome.`,
    );
  }

  if (findChromeExecutable() === null) {
    throw new Error(
      'Google Chrome is required for signal-fire stealth mode.\n' +
        'Install Chrome from https://www.google.com/chrome and restart Signal Fire.\n' +
        'Chrome Stable is recommended.',
    );
  }

  return 'chrome';
}

const BROWSER_FALLBACK_MAJOR = 131;

function chromeMajorFromVersion(version: string | null): number | null {
  if (version === null || version === undefined) return null;
  const match = version.match(/^(\d+)\./);
  if (match === undefined || match === null || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

function chromeUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

async function normalizeFingerprintForRuntime(fp: AccountFingerprint): Promise<AccountFingerprint> {
  const detectedMajor = chromeMajorFromVersion(getInstalledChromeVersion());
  const persistedMajor = chromeMajorFromUA(fp.userAgent);

  if (detectedMajor === null || persistedMajor === detectedMajor) return fp;

  const chromeMajor = detectedMajor ?? persistedMajor ?? BROWSER_FALLBACK_MAJOR;
  return { ...fp, userAgent: chromeUserAgent(chromeMajor) };
}

function warnOnce(key: string, message: string): void {
  if (warnedLaunchOptions.has(key)) return;
  warnedLaunchOptions.add(key);
  log.info(message);
}

function warnIgnoredLaunchOptions(opts: LaunchOptions): void {
  if (opts.headless !== undefined) {
    warnOnce('headless', 'Ignoring headless; Patchright stealth mode is always headed.');
  }
  if (opts.debugUserAgent !== undefined) {
    warnOnce('debugUserAgent', 'Ignoring debugUserAgent; real Chrome owns UA and Client Hints.');
  }
  if (opts.debugViewport !== undefined) {
    warnOnce(
      'debugViewport',
      'Ignoring debugViewport; Patchright stealth mode uses viewport=null.',
    );
  }
}

export async function waitForAnyVisible(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<boolean> {
  if (selectors.length === 0) return false;

  try {
    await Promise.any(
      selectors.map((selector) =>
        page.locator(selector).first().waitFor({ state: 'visible', timeout: timeoutMs }),
      ),
    );
    return true;
  } catch {
    return false;
  }
}

export async function isLocatorVisible(locator: Locator, timeoutMs: number): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function assertNotQuarantined(platform: Platform, accountId: string): Promise<void> {
  const quarantine = await isAccountQuarantined(platform, accountId);
  if (quarantine.quarantined) {
    const until =
      quarantine.untilMs !== undefined ? new Date(quarantine.untilMs).toISOString() : 'unknown';
    throw new Error(`${platform}/${accountId} is quarantined until ${until}`);
  }
}

export async function launchBrowser(opts: LaunchOptions): Promise<LaunchedBrowser> {
  await assertNotQuarantined(opts.platform, opts.accountId);

  warnIgnoredLaunchOptions(opts);
  const browserChannel = resolveBrowserChannel(opts.browserChannel);
  const spoofFingerprint = opts.spoofFingerprint === true;

  const fingerprint = spoofFingerprint
    ? await (async () => {
        // Register the version detector so fingerprint.ts can use it during loadOrCreateFingerprint.
        registerChromeMajorDetector(async () => {
          return chromeMajorFromVersion(getInstalledChromeVersion());
        });
        return normalizeFingerprintForRuntime(await loadOrCreateFingerprint(opts.accountId));
      })()
    : undefined;
  await migrateProfileDirIfNeeded(opts.platform, opts.accountId);
  const paths = getSessionPaths(opts.platform, opts.accountId);

  const chromium = await getChromium();
  const context = await chromium.launchPersistentContext(paths.userDataDir, {
    headless: false,
    channel: browserChannel,
    chromiumSandbox: true,
    // Suppress Playwright/Patchright-injected flags that trigger Chrome's
    // "unsupported command-line flag" warning bar or are obvious automation
    // markers. Real user-launched Chrome never carries these flags.
    ignoreDefaultArgs: [
      // Triggers "unsupported command-line flag" warning bar in real Chrome.
      // Patchright already suppresses navigator.webdriver via JS-level evasions.
      '--disable-blink-features=AutomationControlled',
      // Automation marker; Patchright removes this internally but we list it
      // explicitly as defence-in-depth in case the underlying version changes.
      '--enable-automation',
    ],
    args: buildLaunchArgs(opts.extraArgs),
    acceptDownloads: opts.acceptDownloads ?? false,
    viewport: null,
    ...(fingerprint !== undefined && {
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezoneId,
    }),
    ...(opts.slowMo !== undefined && { slowMo: opts.slowMo }),
  });

  await applyFingerprintEvasions(context, { fingerprint, spoofFingerprint });

  return {
    context,
    ...(fingerprint !== undefined && { fingerprint }),
    close: () => context.close(),
  };
}
