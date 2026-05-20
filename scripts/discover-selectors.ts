/**
 * Selector Discovery Tool
 *
 * Autonomously discovers the correct selectors for each platform intent by:
 * 1. Launching Patchright with the account's logged-in profile
 * 2. Navigating to the platform's relevant URL
 * 3. Running broad heuristics to find ALL candidate elements (up to 10 per intent)
 * 4. Highlighting each candidate + taking a screenshot
 * 5. Writing a JSON report + full page HTML for backup analysis
 *
 * Usage:
 *   pnpm discover-selectors -- --account ThomasDarby --platform linkedin
 *   pnpm discover-selectors -- --account ThomasDarby --platform linkedin --intent startPost
 *   pnpm discover-selectors -- --account ThomasDarby --platform linkedin --spoof-fingerprint
 */

/**
 * SAFETY: This tool is READ-ONLY except for one allowed setup click per dependent intent.
 * The setup click is restricted by SAFE_SETUP_INTENTS, affirmativeKeywords, and DANGER_KEYWORDS.
 * Highlighting and screenshots NEVER trigger clicks — they only set inline CSS styles
 * and call page.screenshot.
 *
 * NEVER add a submit-style intent to SAFE_SETUP_INTENTS.
 * NEVER call .click() anywhere outside the guarded setup path.
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

// ---------------------------------------------------------------------------
// Safety constants
// ---------------------------------------------------------------------------

// EXCLUSIVE allowlist. ONLY these intents may be used as setup triggers.
// All these are guaranteed-safe "opener" UI elements (clicking opens a modal
// or sub-panel; clicking does NOT submit/publish/send anything).
// DO NOT add submit, post, publish, send, share, save, or confirm intents here.
const SAFE_SETUP_INTENTS = new Set<string>();

const DANGER_KEYWORDS = [
  'publish',
  'post now',
  'send',
  'submit',
  'share now',
  'confirm',
  'continue',
  'save',
  'agree',
  'accept',
  'delete',
  'remove',
  'unfollow',
  'block',
  'sign out',
  'log out',
  'switch account',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntentSpec {
  name: string;
  url: string;
  keywords: string[];
  negativeKeywords?: string[];
  elementSelectors: string[];
  /** Names of intents that must be triggered (clicked) before searching for this intent */
  setupIntents?: string[];
  /**
   * Required when this intent is used as a setup trigger (i.e. its name is in SAFE_SETUP_INTENTS).
   * The element being clicked MUST match at least one of these strings (case-insensitive).
   */
  affirmativeKeywords?: string[];
  /** Candidate must be a descendant of this selector. Scopes both element queries and Pass 2 aria scan. */
  requireInsideSelector?: string;
}

interface CandidateMeta {
  tag: string;
  text: string;
  aria: string | null;
  dataControlName: string | null;
  dataTestId: string | null;
  placeholder: string | null;
  title: string | null;
  classNames: string[];
  boundingRect: { x: number; y: number; w: number; h: number };
  visible: boolean;
}

interface DiscoveredCandidate {
  rank: number;
  score: number;
  selectors: string[];
  metadata: CandidateMeta;
  screenshot: string;
}

interface IntentResult {
  name: string;
  url: string;
  isLoggedIn: boolean;
  note?: string;
  candidates: DiscoveredCandidate[];
}

interface DiscoveryReport {
  platform: string;
  accountId: string;
  timestamp: string;
  intents: IntentResult[];
}

// ---------------------------------------------------------------------------
// Platform intent specs
// ---------------------------------------------------------------------------

const LINKEDIN_INTENTS: IntentSpec[] = [
  // ---------------------------------------------------------------------------
  // Company-share composer — ?share=true auto-opens the composer modal.
  // NOTE: URL contains hardcoded company id 110105724 (Thomas Darby's company page) for
  // discovery only. Production selectors.ts and platforms/linkedin/compose.ts should
  // template the company id from user config.
  // ---------------------------------------------------------------------------
  {
    name: 'companyShareComposerOpen',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    // NO setupIntents — the ?share=true param auto-opens the composer.
    keywords: ['what do you want', 'talk about', 'share'],
    elementSelectors: ['[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'],
  },
  {
    name: 'companyShareTextEditor',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['what do you want', 'talk about', 'share box'],
    elementSelectors: ['[contenteditable="true"][role="textbox"]', 'div[contenteditable="true"]'],
  },
  {
    name: 'companyShareAuthorTrigger',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: [
      'individual article',
      'switch author',
      'select profile',
      'publish as',
      'post to',
      'change author',
    ],
    elementSelectors: [
      'button[aria-label*="Switch" i]',
      '[role="combobox"]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="identity" i]',
    ],
  },
  {
    name: 'companyShareVisibilityTrigger',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['anyone', 'post to', 'who can see', 'visibility'],
    elementSelectors: [
      'button:has-text("Post to Anyone")',
      'button:has-text("Anyone")',
      'button[aria-label*="visibility" i]',
    ],
  },
  {
    name: 'companyShareImageButton',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['add a photo', 'photo', 'image', 'add media'],
    negativeKeywords: ['credentials', 'attribution', 'preview'],
    elementSelectors: [
      'button[aria-label*="photo" i]',
      'button[aria-label*="image" i]',
      'button[aria-label*="media" i]',
    ],
  },
  {
    name: 'companyShareEmojiButton',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['emoji', 'open emoji'],
    elementSelectors: ['button[aria-label*="emoji" i]'],
  },
  {
    name: 'companyShareScheduleButton',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['schedule', 'when to post'],
    elementSelectors: ['button[aria-label*="schedul" i]'],
  },
  {
    name: 'companySharePostButton',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['post'],
    // CRITICAL: exclude every non-submit "post"-named element. The actual Post submit is
    // typically a single button at the bottom-right, disabled when text is empty.
    negativeKeywords: [
      'hide',
      'open control menu',
      'reactions',
      'reply',
      'comment',
      'share',
      'visibility',
      'add a photo',
      'add a video',
      'dismiss',
      'rewrite',
      'job',
      'reposts',
    ],
    elementSelectors: ['button:has-text("Post")', 'button[aria-label="Post"]'],
  },
  {
    name: 'companyShareCloseButton',
    url: 'https://www.linkedin.com/company/110105724/admin/page-posts/published/?share=true',
    keywords: ['dismiss', 'close'],
    elementSelectors: ['button[aria-label="Dismiss"]', 'button[aria-label="Close"]'],
  },
  // ---------------------------------------------------------------------------
  // Personal article flow — /article/new/ with no author param opens the editor
  // with the user's personal profile pre-selected as author.
  // ---------------------------------------------------------------------------
  {
    name: 'personalArticleAuthorIndicator',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['individual article', 'switch author', 'select profile', 'publish as'],
    elementSelectors: [
      'button:has-text("Individual article")',
      'button[aria-label*="Switch" i]',
      '[role="combobox"]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="identity" i]',
    ],
  },
  {
    name: 'personalArticleTitle',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['title', 'headline'],
    elementSelectors: [
      '[contenteditable="true"][aria-label*="title" i]',
      'h1[contenteditable="true"]',
      'input[placeholder*="Title" i]',
      'textarea[placeholder*="Title" i]',
    ],
  },
  {
    name: 'personalArticleBody',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['write here', 'mentions', 'body', 'article content'],
    elementSelectors: [
      '[contenteditable="true"][aria-label*="body" i]',
      '[contenteditable="true"][aria-label*="article" i]',
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ],
  },
  {
    name: 'personalArticleCoverImage',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['upload from computer', 'cover image', 'cover video', 'add a cover'],
    negativeKeywords: ['credentials', 'attribution'],
    elementSelectors: [
      'button:has-text("Upload from computer")',
      'button[aria-label*="cover" i]',
      'button[aria-label*="upload" i]',
    ],
  },
  {
    name: 'personalArticleToolbarImage',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['insert image', 'image', 'add image to article'],
    negativeKeywords: ['cover', 'credentials'],
    // The body toolbar image button — usually identified by an image icon, may not have explicit text
    elementSelectors: [
      'button[aria-label*="Insert image" i]',
      'button[aria-label*="Add an image" i]',
    ],
  },
  {
    name: 'personalArticleManageDropdown',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['manage'],
    elementSelectors: ['button:has-text("Manage")', 'button[aria-label*="Manage" i]'],
  },
  {
    name: 'personalArticleNextButton',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['next'],
    negativeKeywords: ['publish', 'post', 'submit', 'send'],
    elementSelectors: ['button:has-text("Next")', 'button[aria-label="Next"]'],
  },
  {
    name: 'personalArticleStyleDropdown',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['style'],
    elementSelectors: ['button:has-text("Style")', 'button[aria-label*="Style" i]'],
  },
  {
    name: 'personalArticleLinkButton',
    url: 'https://www.linkedin.com/article/new/',
    keywords: ['add a link', 'insert link', 'link'],
    elementSelectors: ['button[aria-label*="link" i]'],
  },
  // ---------------------------------------------------------------------------
  // Company article flow — ?author=urn:li:fsd_company:110105724 auto-opens
  // the article editor with the company pre-selected as author.
  // NO setupIntents needed — the URL opens the composer directly.
  // NOTE: URL contains hardcoded company id 110105724 (Thomas Darby's company page) for
  // discovery only. Production selectors.ts and platforms/linkedin/compose.ts should
  // template the company id from user config.
  // ---------------------------------------------------------------------------
  {
    name: 'companyArticleAuthorIndicator',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['individual article', 'switch author', 'select profile', 'publish as'],
    elementSelectors: [
      'button:has-text("Individual article")',
      'button[aria-label*="Switch" i]',
      '[role="combobox"]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="identity" i]',
    ],
  },
  {
    name: 'companyArticleTitle',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['title', 'headline'],
    elementSelectors: [
      '[contenteditable="true"][aria-label*="title" i]',
      'h1[contenteditable="true"]',
      'input[placeholder*="Title" i]',
      'textarea[placeholder*="Title" i]',
    ],
  },
  {
    name: 'companyArticleBody',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['write here', 'mentions', 'body', 'article content'],
    elementSelectors: [
      '[contenteditable="true"][aria-label*="body" i]',
      '[contenteditable="true"][aria-label*="article" i]',
      '[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ],
  },
  {
    name: 'companyArticleCoverImage',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['upload from computer', 'cover image', 'cover video', 'add a cover'],
    negativeKeywords: ['credentials', 'attribution'],
    elementSelectors: [
      'button:has-text("Upload from computer")',
      'button[aria-label*="cover" i]',
      'button[aria-label*="upload" i]',
    ],
  },
  {
    name: 'companyArticleToolbarImage',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['insert image', 'image', 'add image to article'],
    negativeKeywords: ['cover', 'credentials'],
    // The body toolbar image button — usually identified by an image icon, may not have explicit text
    elementSelectors: [
      'button[aria-label*="Insert image" i]',
      'button[aria-label*="Add an image" i]',
    ],
  },
  {
    name: 'companyArticleManageDropdown',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['manage'],
    elementSelectors: ['button:has-text("Manage")', 'button[aria-label*="Manage" i]'],
  },
  {
    name: 'companyArticleNextButton',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['next'],
    negativeKeywords: ['publish', 'post', 'submit', 'send'],
    elementSelectors: ['button:has-text("Next")', 'button[aria-label="Next"]'],
  },
  {
    name: 'companyArticleStyleDropdown',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['style'],
    elementSelectors: ['button:has-text("Style")', 'button[aria-label*="Style" i]'],
  },
  {
    name: 'companyArticleLinkButton',
    url: 'https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A110105724',
    keywords: ['add a link', 'insert link', 'link'],
    elementSelectors: ['button[aria-label*="link" i]'],
  },
];

// TODO: Add intent specs for facebook, instagram, x, tiktok, youtube

const PLATFORM_INTENTS: Record<string, IntentSpec[]> = {
  linkedin: LINKEDIN_INTENTS,
};

const VALID_PLATFORMS = Object.keys(PLATFORM_INTENTS);

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  accountId: string;
  platform: string;
  intent: string | null;
  url: string | undefined;
  skipSetup: boolean;
} {
  const args = process.argv.slice(2);
  let accountId: string | undefined;
  let platform: string | undefined;
  let intent: string | null = null;
  let url: string | undefined;
  let skipSetup = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--account' && args[i + 1] !== undefined) {
      accountId = args[i + 1];
      i++;
    } else if (arg === '--platform' && args[i + 1] !== undefined) {
      platform = args[i + 1];
      i++;
    } else if (arg === '--intent' && args[i + 1] !== undefined) {
      intent = args[i + 1] as string;
      i++;
    } else if (arg === '--url' && args[i + 1] !== undefined) {
      url = args[i + 1];
      i++;
    } else if (arg === '--skip-setup') {
      skipSetup = true;
    }
  }

  if (accountId === undefined || accountId.trim().length === 0) {
    console.error('Error: --account <accountId> is required.');
    console.error(
      'Usage: pnpm discover-selectors -- --account <accountId> --platform <platform> [--intent <name>]',
    );
    process.exit(1);
  }

  if (platform === undefined || platform.trim().length === 0) {
    console.error('Error: --platform <platform> is required.');
    console.error(`Valid platforms: ${VALID_PLATFORMS.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_PLATFORMS.includes(platform.trim())) {
    console.error(`Unknown platform: ${platform}. Valid: ${VALID_PLATFORMS.join(', ')}`);
    process.exit(1);
  }

  return { accountId: accountId.trim(), platform: platform.trim(), intent, url, skipSetup };
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

function cliSpoofFingerprintEnabled(): boolean {
  const args = process.argv.slice(2);
  return args.includes('--spoof-fingerprint') || args.includes('--enable-stealth-fingerprint');
}

// ---------------------------------------------------------------------------
// Browser launch (mirrors audit-selectors.ts)
// ---------------------------------------------------------------------------

const BASE_LAUNCH_ARGS = ['--mute-audio'] as const;
const IGNORE_DEFAULT_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--enable-automation',
] as const;

async function launchDiscoverBrowser(accountId: string): Promise<BrowserContext> {
  if (findChromeExecutable() === null) {
    throw new Error(
      'Google Chrome is required for signal-fire stealth mode.\n' +
        'Install Chrome from https://www.google.com/chrome and restart.',
    );
  }

  const spoofFingerprint = cliSpoofFingerprintEnabled();
  const normalizedFingerprint = spoofFingerprint
    ? await (async () => {
        registerChromeMajorDetector(async () =>
          chromeMajorFromVersion(getInstalledChromeVersion()),
        );
        const fingerprint = await loadOrCreateFingerprint(accountId);
        const detectedMajor = chromeMajorFromVersion(getInstalledChromeVersion());
        const persistedMajor = chromeMajorFromUA(fingerprint.userAgent);
        return detectedMajor !== null && persistedMajor !== detectedMajor
          ? { ...fingerprint, userAgent: chromeUserAgent(detectedMajor) }
          : fingerprint;
      })()
    : undefined;

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
      ...(normalizedFingerprint !== undefined && {
        locale: normalizedFingerprint.locale,
        timezoneId: normalizedFingerprint.timezoneId,
      }),
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

  await applyFingerprintEvasions(context, { fingerprint: normalizedFingerprint, spoofFingerprint });
  return context;
}

// ---------------------------------------------------------------------------
// Output path helpers
// ---------------------------------------------------------------------------

function getSignalFireRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

// ---------------------------------------------------------------------------
// Heuristic candidate finder (page-side — uses raw string JS to avoid esbuild __name issue)
// ---------------------------------------------------------------------------

interface RawCandidate {
  selectors: string[];
  score: number;
  metadata: CandidateMeta;
}

async function findCandidates(
  page: Page,
  elementSelectors: string[],
  keywords: string[],
  negativeKeywords: string[] = [],
  requireInsideSelector?: string,
): Promise<RawCandidate[]> {
  // Pass data as JSON strings to avoid any esbuild closure transformation issues
  const elementSelectorsJson = JSON.stringify(elementSelectors);
  const keywordsJson = JSON.stringify(keywords);
  const negativeKeywordsJson = JSON.stringify(negativeKeywords);
  const requireInsideSelectorJson = JSON.stringify(requireInsideSelector ?? null);

  const code = `(function(elementSelectorsJson, keywordsJson, negativeKeywordsJson, requireInsideSelectorJson) {
    var elementSelectors = JSON.parse(elementSelectorsJson);
    var keywords = JSON.parse(keywordsJson);
    var negativeKeywords = JSON.parse(negativeKeywordsJson);
    var requireInsideSelector = JSON.parse(requireInsideSelectorJson);
    var scopeRoot = requireInsideSelector ? (document.querySelector(requireInsideSelector) || null) : null;

    function containsKeyword(str, kws) {
      if (!str) return false;
      var lower = str.toLowerCase();
      for (var i = 0; i < kws.length; i++) {
        if (lower.indexOf(kws[i].toLowerCase()) !== -1) return true;
      }
      return false;
    }

    function exactMatchKeyword(str, kws) {
      if (!str) return false;
      var lower = str.toLowerCase().trim();
      for (var i = 0; i < kws.length; i++) {
        if (lower === kws[i].toLowerCase()) return true;
      }
      return false;
    }

    function buildSelectors(el) {
      var tag = el.tagName.toLowerCase();
      var result = [];

      var id = el.getAttribute('id');
      if (id && id.length < 40 && !/^\\d+$/.test(id)) {
        result.push('#' + id);
      }

      var testid = el.getAttribute('data-testid');
      if (testid) result.push("[data-testid='" + testid.replace(/'/g, "\\'") + "']");

      var e2e = el.getAttribute('data-e2e');
      if (e2e) result.push("[data-e2e='" + e2e.replace(/'/g, "\\'") + "']");

      var ctrl = el.getAttribute('data-control-name');
      if (ctrl) result.push("[data-control-name='" + ctrl.replace(/'/g, "\\'") + "']");

      var aria = el.getAttribute('aria-label');
      if (aria) result.push(tag + "[aria-label='" + aria.replace(/'/g, "\\'") + "']");

      var text = (el.textContent || '').trim().slice(0, 40);
      if (text.length > 0 && text.length <= 40 && (tag === 'button' || tag === 'a')) {
        result.push(tag + ":has-text('" + text.replace(/'/g, "\\'") + "')");
      }

      var classArr = Array.from(el.classList).filter(function(c) {
        return c.length > 2 && !/^[a-z0-9]{8,}$/.test(c);
      }).slice(0, 3);
      if (classArr.length > 0) {
        result.push(tag + '.' + classArr.join('.'));
      }

      return result;
    }

    function findClickHandlerAncestor(el) {
      var cur = el.parentElement;
      var hops = 0;
      while (cur && hops < 6) {
        if (cur === document.body) return null;
        if (cur.matches && (
          cur.matches('[role="button"]') ||
          cur.tagName === 'BUTTON' ||
          cur.tagName === 'A' ||
          cur.getAttribute('tabindex') === '0'
        )) {
          return cur;
        }
        cur = cur.parentElement;
        hops++;
      }
      return null;
    }

    function buildAncestorSelectors(ancestor, originalEl) {
      var tag = ancestor.tagName.toLowerCase();
      var result = [];
      var aria = originalEl.getAttribute('aria-label');
      var testid = originalEl.getAttribute('data-testid');
      var origText = (originalEl.textContent || '').trim().slice(0, 40);
      var role = ancestor.getAttribute('role');
      var roleAttr = role ? '[role="' + role + '"]' : '';

      if (aria) {
        result.push(tag + roleAttr + ':has([aria-label="' + aria.replace(/"/g, '\\"') + '"])');
      }
      if (testid) {
        result.push(tag + roleAttr + ':has([data-testid="' + testid.replace(/"/g, '\\"') + '"])');
      }
      if (origText.length > 0 && origText.length <= 40) {
        result.push(tag + roleAttr + ':has-text("' + origText.replace(/"/g, '\\"') + '")');
      }
      // Fallback: tag + role only
      if (result.length === 0 && roleAttr) {
        result.push(tag + roleAttr);
      }
      return result;
    }

    function getRect(el) {
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }

    function isVisible(el, rect) {
      return el.offsetParent !== null && rect.w > 0 && rect.h > 0;
    }

    function scoreElement(el) {
      var text = (el.textContent || '').trim().slice(0, 80);
      var aria = el.getAttribute('aria-label');
      var ctrl = el.getAttribute('data-control-name');
      var testid = el.getAttribute('data-testid');
      var placeholder = el.getAttribute('placeholder');
      var title = el.getAttribute('title');

      // Negative keyword check — if any negative keyword matches aria or text, score = 0
      if (negativeKeywords.length > 0) {
        if (containsKeyword(aria, negativeKeywords) || containsKeyword(text, negativeKeywords)) {
          return null;
        }
      }

      var score = 0;

      if (exactMatchKeyword(aria, keywords)) score += 10;
      else if (containsKeyword(aria, keywords)) score += 5;

      if (exactMatchKeyword(text, keywords)) score += 3;
      else if (containsKeyword(text, keywords)) score += 2;

      if (containsKeyword(ctrl, keywords)) score += 1;
      if (containsKeyword(testid, keywords)) score += 1;
      if (containsKeyword(placeholder, keywords)) score += 1;
      if (containsKeyword(title, keywords)) score += 1;

      if (score === 0) return null;

      var rect = getRect(el);
      var visible = isVisible(el, rect);
      if (visible) score += 20;

      var classArr = Array.from(el.classList).filter(function(c) {
        return c.length > 2 && !/^[a-z0-9]{8,}$/.test(c);
      }).slice(0, 5);

      return {
        _element: el,
        selectors: buildSelectors(el),
        score: score,
        metadata: {
          tag: el.tagName.toLowerCase(),
          text: text,
          aria: aria,
          dataControlName: ctrl,
          dataTestId: testid,
          placeholder: placeholder,
          title: title,
          classNames: classArr,
          boundingRect: rect,
          visible: visible
        }
      };
    }

    var seen = new Set();
    var candidates = [];

    // If requireInsideSelector is set and the root doesn't exist, return nothing —
    // the modal hasn't opened yet.
    if (requireInsideSelector && scopeRoot === null) {
      return [];
    }

    var queryRoot = scopeRoot || document;

    // Pass 1: query by elementSelectors
    for (var si = 0; si < elementSelectors.length; si++) {
      var sel = elementSelectors[si];
      var els;
      try {
        els = queryRoot.querySelectorAll(sel);
      } catch(e) {
        continue;
      }
      for (var ei = 0; ei < els.length; ei++) {
        var el = els[ei];
        if (seen.has(el)) continue;
        seen.add(el);
        var result = scoreElement(el);
        if (result !== null) candidates.push(result);
      }
    }

    // Pass 2: broad aria-label query — catches elements not matched by elementSelectors
    var ariaEls = queryRoot.querySelectorAll('[aria-label]');
    for (var ai = 0; ai < ariaEls.length; ai++) {
      var ael = ariaEls[ai];
      if (seen.has(ael)) continue;
      seen.add(ael);
      var aResult = scoreElement(ael);
      if (aResult !== null) candidates.push(aResult);
    }

    // Ancestor walk: replace each candidate with its nearest interactive ancestor,
    // so that clicks land on the element React's onClick is actually bound to.
    for (var wi = 0; wi < candidates.length; wi++) {
      var cand = candidates[wi];
      var origEl = cand._element;
      if (!origEl) continue;
      var ancestor = findClickHandlerAncestor(origEl);
      if (!ancestor || ancestor === origEl) continue;
      // Don't replace if ancestor is already a candidate
      var alreadyPresent = false;
      for (var ak = 0; ak < candidates.length; ak++) {
        if (candidates[ak]._element === ancestor) { alreadyPresent = true; break; }
      }
      if (alreadyPresent) continue;
      // Replace element and rebuild selectors for the ancestor
      cand._element = ancestor;
      var ancestorSelectors = buildAncestorSelectors(ancestor, origEl);
      cand.selectors = ancestorSelectors.length > 0 ? ancestorSelectors : cand.selectors;
      // Update metadata to reflect the ancestor
      cand.metadata.tag = ancestor.tagName.toLowerCase();
      cand.metadata.aria = ancestor.getAttribute('aria-label');
      cand.metadata.dataTestId = ancestor.getAttribute('data-testid');
      var aRect = getRect(ancestor);
      cand.metadata.boundingRect = aRect;
      cand.metadata.visible = isVisible(ancestor, aRect);
    }

    // Dedup by element identity after ancestor replacement
    var seenElements = new Set();
    var deduped = [];
    for (var di = 0; di < candidates.length; di++) {
      var dc = candidates[di];
      var key = dc._element || dc.selectors[0] || String(di);
      if (!seenElements.has(key)) {
        seenElements.add(key);
        deduped.push(dc);
      }
    }
    candidates = deduped;

    candidates.sort(function(a, b) { return b.score - a.score; });
    return candidates.slice(0, 10).map(function(c) {
      return { selectors: c.selectors, score: c.score, metadata: c.metadata };
    });
  })(${JSON.stringify(elementSelectorsJson)}, ${JSON.stringify(keywordsJson)}, ${JSON.stringify(negativeKeywordsJson)}, ${JSON.stringify(requireInsideSelectorJson)})`;

  const result = await page.evaluate<RawCandidate[]>(code);
  return result;
}

// ---------------------------------------------------------------------------
// Highlight + screenshot per candidate (page-side string JS)
// ---------------------------------------------------------------------------

async function highlightCandidate(
  page: Page,
  candidate: RawCandidate,
  intentName: string,
  rank: number,
  total: number,
): Promise<void> {
  const bannerText = `INTENT: ${intentName} | CANDIDATE ${rank}/${total} | SCORE: ${candidate.metadata.score ?? candidate.score} | TAG: ${candidate.metadata.tag}`;
  const selectorToUse = candidate.selectors[0] ?? candidate.metadata.tag;

  const highlightCode = `(function(selectorJson, bannerTextJson) {
    var selector = JSON.parse(selectorJson);
    var bannerText = JSON.parse(bannerTextJson);
    try {
      var el = document.querySelector(selector);
      if (el) {
        el.__sfDiscoverMarked = true;
        el.style.outline = '4px solid #ff3300';
        el.style.outlineOffset = '3px';
        el.style.boxShadow = '0 0 0 8px rgba(255, 51, 0, 0.4)';
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      }
      var banner = document.createElement('div');
      banner.id = '__sf_discover_banner';
      banner.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647;background:#1a1a1a;color:#fff;font-family:monospace;font-size:12px;padding:8px 12px;max-width:95vw;border:2px solid #ff3300;white-space:pre;pointer-events:none';
      banner.textContent = bannerText;
      document.body.appendChild(banner);
    } catch(e) { /* swallow */ }
  })(${JSON.stringify(JSON.stringify(selectorToUse))}, ${JSON.stringify(JSON.stringify(bannerText))})`;

  await page.evaluate(highlightCode);
  await page.waitForTimeout(250);
}

async function removeHighlight(page: Page): Promise<void> {
  const cleanupCode = `(function() {
    try {
      var els = document.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__sfDiscoverMarked) {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = '';
          el.__sfDiscoverMarked = false;
        }
      }
      var banner = document.getElementById('__sf_discover_banner');
      if (banner) banner.remove();
    } catch(e) { /* swallow */ }
  })()`;
  await page.evaluate(cleanupCode);
}

// ---------------------------------------------------------------------------
// Setup intent: safely click the startPost trigger to open the composer
// ---------------------------------------------------------------------------

async function runSetupIntent(
  page: Page,
  setupIntentName: string,
  discoveredPrimarySelectors: Map<string, string>,
  intentSpec: IntentSpec,
): Promise<boolean> {
  // Gate 1: intent name must be in the exclusive allowlist
  if (!SAFE_SETUP_INTENTS.has(setupIntentName)) {
    throw new Error(
      `[discover] SAFETY: setup intent '${setupIntentName}' is NOT in SAFE_SETUP_INTENTS. ` +
        `Aborting — only these intents may trigger a setup click: ${[...SAFE_SETUP_INTENTS].join(', ')}`,
    );
  }

  const primarySelector = discoveredPrimarySelectors.get(setupIntentName);
  if (primarySelector === undefined) {
    console.warn(
      `  [setup] No primary selector found for setup intent '${setupIntentName}' — skipping`,
    );
    return false;
  }

  // Read the element's aria-label and visible text for the safety checks
  const elementText: { aria: string; text: string } = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return { aria: '', text: '' };
    return {
      aria: (el.getAttribute('aria-label') ?? '').toLowerCase(),
      text: (el.textContent ?? '').trim().slice(0, 120).toLowerCase(),
    };
  }, primarySelector);

  const combinedText = `${elementText.aria} ${elementText.text}`;

  // Gate 2: danger-keyword guard — refuse if any danger keyword is present
  const matchedDanger = DANGER_KEYWORDS.find((kw) => combinedText.includes(kw));
  if (matchedDanger !== undefined) {
    process.stderr.write(
      `[discover] SAFETY: refusing to click setup target — aria/text matches danger keyword '${matchedDanger}'. Aborting setup.\n`,
    );
    throw new Error(
      `[discover] SAFETY: setup click refused — element aria/text matches danger keyword '${matchedDanger}'`,
    );
  }

  // Gate 3: affirmative-keyword requirement — element MUST match at least one expected keyword
  const affirmativeKeywords = intentSpec.affirmativeKeywords ?? [];
  if (affirmativeKeywords.length === 0) {
    throw new Error(
      `[discover] SAFETY: intent '${setupIntentName}' is in SAFE_SETUP_INTENTS but has no affirmativeKeywords defined. Aborting.`,
    );
  }
  const matchedAffirmative = affirmativeKeywords.find((kw) =>
    combinedText.includes(kw.toLowerCase()),
  );
  if (matchedAffirmative === undefined) {
    process.stderr.write(
      `[discover] SAFETY: refusing to click setup target — aria/text does not match any affirmativeKeyword for '${setupIntentName}'. Aborting setup.\n`,
    );
    throw new Error(
      `[discover] SAFETY: setup click refused — element aria/text matched none of the required affirmativeKeywords: ${affirmativeKeywords.join(', ')}`,
    );
  }

  // All three gates passed — safe to click
  const displayText = elementText.aria || elementText.text || primarySelector;
  console.log(`[discover] SAFE setup click on '${displayText}' for intent '${setupIntentName}'`);

  const locator = page.locator(primarySelector).first();
  try {
    await locator.waitFor({ state: 'visible', timeout: 5_000 });
  } catch (err) {
    console.warn(
      `  [setup] Element not visible for '${setupIntentName}': ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  // Walk to the click-handler ancestor using a raw JS string so esbuild
  // cannot inject __name helpers or rewrite closures for the browser context.
  const selectorLiteral = JSON.stringify(primarySelector);
  const ancestorRectCode = `(function() {
  var selector = ${selectorLiteral};
  function isInteractive(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.tagName === 'BUTTON' || node.tagName === 'A') return true;
    if (node.getAttribute && node.getAttribute('role') === 'button') return true;
    if (node.getAttribute && node.getAttribute('tabindex') === '0') return true;
    return false;
  }
  function findAncestor(el) {
    if (isInteractive(el)) return el;
    var cur = el.parentElement;
    var hops = 0;
    while (cur && hops < 6 && cur !== document.body) {
      if (cur.tagName === 'INPUT' && (cur.type === 'submit' || cur.type === 'button')) {
        return el;
      }
      if (isInteractive(cur)) return cur;
      cur = cur.parentElement;
      hops++;
    }
    return el;
  }
  var matched = document.querySelector(selector);
  if (!matched) return null;
  var target = findAncestor(matched);
  if (!target) return null;
  var r = target.getBoundingClientRect();
  return {
    x: r.x, y: r.y, width: r.width, height: r.height,
    isAncestor: target !== matched,
    tag: target.tagName.toLowerCase()
  };
})()`;

  const ancestorRect = await page.evaluate<{
    x: number;
    y: number;
    width: number;
    height: number;
    isAncestor: boolean;
    tag: string;
  } | null>(ancestorRectCode);

  if (ancestorRect === null) {
    console.warn(`  [setup] setup target not found for click: ${primarySelector}`);
    return false;
  }

  process.stderr.write(
    `[discover] Click target: ${ancestorRect.isAncestor ? 'ancestor of ' : ''}${primarySelector} (tag=${ancestorRect.tag})\n`,
  );

  // Safety check for inner <p> strategy: confirm it is a descendant of the validated wrapper.
  // Inlined as a raw JS string to avoid esbuild __name injection.
  const innerSafetyCode = `(function() {
  var wrapper = document.querySelector(${JSON.stringify(primarySelector)});
  if (!wrapper) return false;
  var ps = wrapper.querySelectorAll('p');
  for (var i = 0; i < ps.length; i++) {
    if ((ps[i].textContent || '').trim().toLowerCase().indexOf('start a post') !== -1) return true;
  }
  return false;
})()`;
  const innerOk = await page.evaluate<boolean>(innerSafetyCode);

  const box = ancestorRect;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const strategies: Array<{ name: string; fn: () => Promise<void> }> = [
    {
      name: 'mouse.down+up',
      fn: async () => {
        await page.mouse.move(cx, cy, { steps: 6 });
        await page.waitForTimeout(80);
        await page.mouse.down();
        await page.waitForTimeout(60);
        await page.mouse.up();
      },
    },
    {
      name: 'locator.click({force})',
      fn: async () => {
        await locator.click({ force: true, timeout: 3000 });
      },
    },
    {
      name: 'dispatchEvent click',
      fn: async () => {
        await locator.dispatchEvent('click');
      },
    },
    {
      name: 'focus + Space',
      fn: async () => {
        await locator.focus();
        await page.waitForTimeout(100);
        await page.keyboard.press('Space');
      },
    },
    ...(innerOk
      ? [
          {
            name: 'click inner <p>',
            fn: async () => {
              const inner = page.locator('p:has-text("Start a post")').first();
              await inner.click({ force: true, timeout: 3000 });
            },
          },
        ]
      : []),
  ];

  for (const s of strategies) {
    try {
      process.stderr.write(`[discover] Trying click strategy: ${s.name}\n`);
      await s.fn();
      await page.waitForTimeout(1200);
      // Check whether the composer modal appeared
      const dialogs = await page.locator('div[role="dialog"]').all();
      let foundComposer = false;
      for (const d of dialogs) {
        const aria = (await d.getAttribute('aria-label')) ?? '';
        if (
          /post|share|create|edit/i.test(aria) ||
          (await d.locator('[contenteditable="true"]').count()) > 0
        ) {
          foundComposer = true;
          break;
        }
      }
      if (foundComposer) {
        process.stderr.write(`[discover] Composer opened via: ${s.name}\n`);
        // DIAGNOSTIC: capture state at the moment of detection
        const diagPath = path.join(intentDir, '_post-click-state.png');
        try {
          await page.screenshot({ path: diagPath, fullPage: true });
        } catch {}
        process.stderr.write(`[discover] Post-click screenshot: ${diagPath}\n`);
        // Also dump all iframe sources
        const frameSrcs = page.frames().map((f) => f.url());
        process.stderr.write(
          `[discover] Frames present (${frameSrcs.length}): ${frameSrcs.join(', ')}\n`,
        );
        return true;
      }
    } catch (err) {
      process.stderr.write(
        `[discover]   strategy '${s.name}' threw: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  process.stderr.write('[discover] All click strategies exhausted; composer did not open\n');
  return false;
}

// ---------------------------------------------------------------------------
// Per-intent discovery
// ---------------------------------------------------------------------------

async function discoverIntent(
  page: Page,
  intent: IntentSpec,
  outputDir: string,
  discoveredPrimarySelectors: Map<string, string>,
  allIntents: IntentSpec[],
  urlOverride?: string,
  skipSetup?: boolean,
): Promise<IntentResult> {
  const targetUrl = urlOverride ?? intent.url;
  console.log(`\n[${intent.name}] Navigating to ${targetUrl} ...`);

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
      console.warn(`  [${intent.name}] networkidle timeout — continuing`);
    });
  } catch (err) {
    console.warn(
      `  [${intent.name}] Navigation error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const finalUrl = page.url();
  const isLoggedIn = !(finalUrl.includes('/login') || finalUrl.includes('/signup'));

  if (!isLoggedIn) {
    console.warn(`  [${intent.name}] Not logged in — skipping`);
    return {
      name: intent.name,
      url: intent.url,
      isLoggedIn: false,
      note: 'Not logged in — no candidates discovered',
      candidates: [],
    };
  }

  // Run setup intents if required
  if (intent.setupIntents !== undefined && intent.setupIntents.length > 0 && !skipSetup) {
    for (const setupName of intent.setupIntents) {
      const setupSpec = allIntents.find((s) => s.name === setupName);
      if (setupSpec === undefined) {
        throw new Error(
          `[discover] SAFETY: setup intent '${setupName}' not found in allIntents. Aborting.`,
        );
      }
      await runSetupIntent(page, setupName, discoveredPrimarySelectors, setupSpec);
    }
  } else if (intent.setupIntents !== undefined && intent.setupIntents.length > 0 && skipSetup) {
    console.log('  [setup] skipped (--skip-setup)');
  }

  console.log(`  [${intent.name}] Searching for candidates...`);
  let rawCandidates: RawCandidate[] = [];
  try {
    rawCandidates = await findCandidates(
      page,
      intent.elementSelectors,
      intent.keywords,
      intent.negativeKeywords ?? [],
      intent.requireInsideSelector,
    );
  } catch (err) {
    console.warn(
      `  [${intent.name}] Candidate search failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  console.log(`  [${intent.name}] Found ${rawCandidates.length} candidates`);

  const candidates: DiscoveredCandidate[] = [];

  for (let i = 0; i < rawCandidates.length; i++) {
    const raw = rawCandidates[i];
    if (raw === undefined) continue;
    const rank = i + 1;
    const screenshotFile = `${intent.name}-${rank}.png`;
    const screenshotPath = path.join(outputDir, screenshotFile);

    try {
      await highlightCandidate(page, raw, intent.name, rank, rawCandidates.length);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      await removeHighlight(page);
      console.log(
        `  [${intent.name}] Screenshot ${rank}/${rawCandidates.length}: ${screenshotFile}`,
      );
    } catch (err) {
      console.warn(
        `  [${intent.name}] Screenshot ${rank} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await removeHighlight(page).catch(() => undefined);
    }

    candidates.push({
      rank,
      score: raw.score,
      selectors: raw.selectors,
      metadata: raw.metadata,
      screenshot: screenshotFile,
    });
  }

  // Record the primary selector for this intent so dependent intents can use it
  const topCandidate = candidates[0];
  if (topCandidate !== undefined && topCandidate.selectors.length > 0) {
    discoveredPrimarySelectors.set(intent.name, topCandidate.selectors[0] as string);
  }

  return {
    name: intent.name,
    url: intent.url,
    isLoggedIn: true,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// Page HTML dump
// ---------------------------------------------------------------------------

async function dumpPageHtml(page: Page, outputDir: string, intentName: string): Promise<void> {
  try {
    const html = await page.content();
    const filename = `${intentName}-page.html`;
    await fs.writeFile(path.join(outputDir, filename), html, 'utf8');
    console.log(`  [${intentName}] HTML saved: ${filename}`);
  } catch (err) {
    console.warn(
      `  [${intentName}] HTML dump failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { accountId, platform, intent: intentFilter, url: urlOverride, skipSetup } = parseArgs();

  const allIntents = PLATFORM_INTENTS[platform];
  if (allIntents === undefined) {
    console.error(`No intents defined for platform: ${platform}`);
    process.exit(1);
  }

  const intentsToRun =
    intentFilter !== null ? allIntents.filter((i) => i.name === intentFilter) : allIntents;

  if (intentsToRun.length === 0) {
    console.error(
      intentFilter !== null
        ? `Unknown intent '${intentFilter}' for platform '${platform}'. Valid: ${allIntents.map((i) => i.name).join(', ')}`
        : `No intents configured for platform '${platform}'`,
    );
    process.exit(1);
  }

  const runTs = new Date().toISOString().replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
  const outputDir = path.join(getSignalFireRoot(), 'discover', `${runTs}-${platform}`);
  await fs.mkdir(outputDir, { recursive: true });

  console.log('\nsignal-fire selector discovery');
  console.log(`  Account  : ${accountId}`);
  console.log(`  Platform : ${platform}`);
  console.log(`  Intents  : ${intentsToRun.map((i) => i.name).join(', ')}`);
  console.log(`  Output   : ${outputDir}`);
  if (urlOverride !== undefined) {
    console.log('URL override:', urlOverride);
  }

  console.log('\nLaunching browser...');
  const context = await launchDiscoverBrowser(accountId);

  const report: DiscoveryReport = {
    platform,
    accountId,
    timestamp: new Date().toISOString(),
    intents: [],
  };

  // Tracks the best selector for each discovered intent (used by setupIntents)
  const discoveredPrimarySelectors = new Map<string, string>();

  try {
    const page = context.pages()[0] ?? (await context.newPage());

    // If we're running setup-dependent intents, ensure startPost is also run first
    // so its selector is available even if --intent filters it out
    const needsSetupBootstrap =
      intentFilter !== null &&
      intentsToRun.some((i) => i.setupIntents !== undefined && i.setupIntents.length > 0);

    if (needsSetupBootstrap) {
      const setupNames = new Set<string>();
      for (const intent of intentsToRun) {
        for (const s of intent.setupIntents ?? []) {
          setupNames.add(s);
        }
      }
      for (const setupName of setupNames) {
        const setupSpec = allIntents.find((i) => i.name === setupName);
        if (setupSpec !== undefined && !intentsToRun.some((i) => i.name === setupName)) {
          console.log(`\n[bootstrap] Running setup intent '${setupName}' first...`);
          const setupResult = await discoverIntent(
            page,
            setupSpec,
            outputDir,
            discoveredPrimarySelectors,
            allIntents,
            urlOverride,
            skipSetup,
          );
          report.intents.push(setupResult);
          await dumpPageHtml(page, outputDir, setupName);
        }
      }
    }

    for (const intent of intentsToRun) {
      const result = await discoverIntent(
        page,
        intent,
        outputDir,
        discoveredPrimarySelectors,
        allIntents,
        urlOverride,
        skipSetup,
      );
      report.intents.push(result);
      await dumpPageHtml(page, outputDir, intent.name);
    }
  } finally {
    await context.close();
  }

  // Write report
  const reportPath = path.join(outputDir, 'report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReport written: ${reportPath}`);

  // Summary
  console.log('\n=== Discovery Summary ===');
  for (const intentResult of report.intents) {
    const count = intentResult.candidates.length;
    const top =
      intentResult.candidates[0] !== undefined
        ? `top="${intentResult.candidates[0].selectors[0] ?? 'n/a'}" score=${intentResult.candidates[0].score}`
        : 'no candidates';
    console.log(`  ${intentResult.name}: ${count} candidates | ${top}`);
  }
  console.log(`\nOutput dir: ${outputDir}`);
}

main().catch((err) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
