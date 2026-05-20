/**
 * DOM Inspection Tool
 *
 * Dumps ALL semantically-meaningful elements from a logged-in page so you
 * can identify the correct current selectors for things like buttons,
 * editors, etc.
 *
 * Usage:
 *   pnpm inspect-dom -- --account <accountId> --url <url> [--grep <regex>]
 */

import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { chromium } from 'patchright';
import type { BrowserContext } from 'patchright';

import { applyFingerprintEvasions } from '../src/core/evasions/index.js';
import {
  chromeMajorFromUA,
  loadOrCreateFingerprint,
  registerChromeMajorDetector,
} from '../src/core/fingerprint.js';
import { getSessionPaths } from '../src/core/session.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoundingRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DomElement {
  tag: string;
  text: string;
  aria: string | null;
  role: string | null;
  href: string | null;
  placeholder: string | null;
  testIds: Record<string, string>;
  classNames: string[];
  cssSelector: string;
  boundingRect: BoundingRect;
  visible: boolean;
}

interface InspectionReport {
  url: string;
  finalUrl: string;
  accountId: string;
  timestamp: string;
  isLoggedIn: boolean;
  elements: DomElement[];
}

// ---------------------------------------------------------------------------
// Constants (mirrors audit-selectors.ts)
// ---------------------------------------------------------------------------

const BASE_LAUNCH_ARGS = ['--mute-audio'] as const;

const IGNORE_DEFAULT_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--enable-automation',
] as const;

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { accountId: string; url: string; grep: string | null } {
  const args = process.argv.slice(2);
  let accountId: string | undefined;
  let url: string | undefined;
  let grep: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--account' && args[i + 1] !== undefined) {
      accountId = args[i + 1];
      i++;
    } else if (arg === '--url' && args[i + 1] !== undefined) {
      url = args[i + 1];
      i++;
    } else if (arg === '--grep' && args[i + 1] !== undefined) {
      grep = args[i + 1] as string;
      i++;
    }
  }

  if (accountId === undefined || accountId.trim().length === 0) {
    console.error('Error: --account <accountId> is required.');
    console.error('Usage: pnpm inspect-dom -- --account <accountId> --url <url> [--grep <regex>]');
    process.exit(1);
  }
  if (url === undefined || url.trim().length === 0) {
    console.error('Error: --url <url> is required.');
    console.error('Usage: pnpm inspect-dom -- --account <accountId> --url <url> [--grep <regex>]');
    process.exit(1);
  }

  return { accountId: accountId.trim(), url: url.trim(), grep };
}

// ---------------------------------------------------------------------------
// Chrome detection (mirrors audit-selectors.ts)
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
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter((p) => p.length > 'chrome.exe'.length);
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
// Browser launch (mirrors audit-selectors.ts launchAuditBrowser)
// ---------------------------------------------------------------------------

async function launchBrowser(accountId: string): Promise<BrowserContext> {
  if (findChromeExecutable() === null) {
    throw new Error(
      'Google Chrome is required for signal-fire stealth mode.\n' +
        'Install Chrome from https://www.google.com/chrome and restart.',
    );
  }

  registerChromeMajorDetector(async () => chromeMajorFromVersion(getInstalledChromeVersion()));

  const fingerprint = await loadOrCreateFingerprint(accountId);

  const detectedMajor = chromeMajorFromVersion(getInstalledChromeVersion());
  const persistedMajor = chromeMajorFromUA(fingerprint.userAgent);
  const normalizedFingerprint =
    detectedMajor !== null && persistedMajor !== detectedMajor
      ? { ...fingerprint, userAgent: chromeUserAgent(detectedMajor) }
      : fingerprint;

  const paths = getSessionPaths('linkedin', accountId);
  const userDataDir = paths.userDataDir;

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
// Output path helpers
// ---------------------------------------------------------------------------

function getSignalFireRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

async function writeInspectionReport(report: InspectionReport, host: string): Promise<string> {
  const dir = path.join(getSignalFireRoot(), 'dom-inspections');
  await fs.mkdir(dir, { recursive: true });
  const ts = report.timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `${ts}-${host}.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// DOM extraction (runs entirely inside page.evaluate)
// ---------------------------------------------------------------------------

async function extractElements(page: import('patchright').Page): Promise<DomElement[]> {
  return page.evaluate((): DomElement[] => {
    // ----- types (inline, browser context has no imports) -----
    interface BoundingRect {
      x: number;
      y: number;
      w: number;
      h: number;
    }
    interface DomElement {
      tag: string;
      text: string;
      aria: string | null;
      role: string | null;
      href: string | null;
      placeholder: string | null;
      testIds: Record<string, string>;
      classNames: string[];
      cssSelector: string;
      boundingRect: BoundingRect;
      visible: boolean;
    }

    // ----- helpers -----

    const TEST_ID_ATTRS = [
      'data-testid',
      'data-test-id',
      'data-test',
      'data-e2e',
      'data-control-name',
    ] as const;

    const HASH_RE = /^[a-zA-Z0-9_-]{10,}$/;
    const BEM_RE = /^[a-z][a-z0-9-]*__[a-z][a-z0-9-]*$/;

    function isHashClass(cls: string): boolean {
      // Keep BEM-ish classes, drop anything that looks like a generated hash
      if (BEM_RE.test(cls)) return false;
      if (HASH_RE.test(cls) && /\d/.test(cls)) return true;
      return false;
    }

    function topClassNames(el: Element): string[] {
      return Array.from(el.classList)
        .filter((c) => !isHashClass(c))
        .slice(0, 3);
    }

    function stableSelector(el: Element): string {
      const tag = el.tagName.toLowerCase();

      // #id — short, no pure digits
      const id = el.getAttribute('id');
      if (id && id.length < 30 && !/^\d+$/.test(id)) {
        return `#${id}`;
      }

      // data-testid
      const testid = el.getAttribute('data-testid');
      if (testid) return `[data-testid='${testid}']`;

      // data-e2e
      const dataE2e = el.getAttribute('data-e2e');
      if (dataE2e) return `[data-e2e='${dataE2e}']`;

      // aria-label
      const aria = el.getAttribute('aria-label');
      if (aria) {
        const escaped = aria.replace(/'/g, "\\'");
        return `${tag}[aria-label='${escaped}']`;
      }

      // short text for buttons/links
      const text = (el.textContent ?? '').trim().slice(0, 40);
      if (text.length > 0 && text.length <= 40 && (tag === 'button' || tag === 'a')) {
        const escaped = text.replace(/'/g, "\\'");
        return `${tag}:has-text('${escaped}')`;
      }

      return tag;
    }

    function getRect(el: Element): BoundingRect {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }

    function isVisible(el: Element, rect: BoundingRect): boolean {
      return (el as HTMLElement).offsetParent !== null && rect.w > 0 && rect.h > 0;
    }

    // ----- query all candidate elements -----

    const selector = [
      '[aria-label]',
      'button',
      '[role="button"]',
      'a[href]',
      '[contenteditable="true"]',
      'input',
      'textarea',
      'select',
      '[data-testid]',
      '[data-test-id]',
      '[data-test]',
      '[data-e2e]',
      '[data-control-name]',
    ].join(', ');

    const seen = new Set<Element>();
    const results: DomElement[] = [];

    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);

      const tag = el.tagName.toLowerCase();
      const text = (el.textContent ?? '').trim().slice(0, 100);
      const aria = el.getAttribute('aria-label');
      const role = el.getAttribute('role');
      const href = el.getAttribute('href') ?? null;
      const placeholder = el.getAttribute('placeholder') ?? null;

      const testIds: Record<string, string> = {};
      for (const attr of TEST_ID_ATTRS) {
        const val = el.getAttribute(attr);
        if (val !== null) testIds[attr] = val;
      }

      const classNames = topClassNames(el);
      const cssSelector = stableSelector(el);
      const boundingRect = getRect(el);
      const visible = isVisible(el, boundingRect);

      results.push({
        tag,
        text,
        aria,
        role,
        href,
        placeholder,
        testIds,
        classNames,
        cssSelector,
        boundingRect,
        visible,
      });
    }

    // Sort: visible first, then top-to-bottom, left-to-right
    results.sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1;
      if (a.boundingRect.y !== b.boundingRect.y) return a.boundingRect.y - b.boundingRect.y;
      return a.boundingRect.x - b.boundingRect.x;
    });

    return results;
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { accountId, url, grep } = parseArgs();

  console.log('\nsignal-fire DOM inspector');
  console.log(`  Account : ${accountId}`);
  console.log(`  URL     : ${url}`);
  if (grep !== null) console.log(`  Grep    : ${grep}`);

  console.log('\nLaunching browser...');
  const context = await launchBrowser(accountId);

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    console.log('Navigating...');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.warn('networkidle timeout — continuing with current DOM');
    });

    const finalUrl = page.url();
    const isLoggedIn = !(finalUrl.includes('/login') || finalUrl.includes('/signup'));

    console.log('Extracting DOM elements...');
    let elements = await extractElements(page);

    // Apply --grep filter
    if (grep !== null) {
      const re = new RegExp(grep, 'i');
      elements = elements.filter((el) => {
        const testIdsStr = JSON.stringify(el.testIds);
        const classNamesStr = el.classNames.join(' ');
        return (
          re.test(el.text) ||
          (el.aria !== null && re.test(el.aria)) ||
          re.test(testIdsStr) ||
          re.test(classNamesStr)
        );
      });
    }

    const timestamp = new Date().toISOString();
    const host = new URL(url).hostname.replace(/^www\./, '');

    const report: InspectionReport = {
      url,
      finalUrl,
      accountId,
      timestamp,
      isLoggedIn,
      elements,
    };

    const outputPath = await writeInspectionReport(report, host);

    // Print summary
    console.log('\n--- Summary ---');
    console.log(`Elements found : ${elements.length}`);
    console.log(`Output         : ${outputPath}`);

    const topVisible = elements.filter((el) => el.visible && el.aria !== null).slice(0, 10);

    if (topVisible.length > 0) {
      console.log('\nTop 10 visible aria-labeled elements:');
      for (const el of topVisible) {
        const text = el.text.slice(0, 50).replace(/\n/g, ' ');
        console.log(`  [${el.tag}] aria="${el.aria}" text="${text}"`);
        console.log(`           cssSelector: ${el.cssSelector}`);
      }
    }
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error('Inspect failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
