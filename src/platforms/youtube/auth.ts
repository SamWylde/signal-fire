// WARNING: YouTube login is Google login. Google's bot detection is aggressive.
// Cookie-based auth is strongly preferred.

import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import { type PlaywrightCookie, applyCookies, loadCookies } from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { YOUTUBE } from './selectors.js';

export interface YouTubeAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  credentials?: {
    email: string;
    password: string;
  };
}

export interface YouTubeAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

function requireCredentials(credentials: YouTubeAuthInput['credentials']): {
  email: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.email.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('YouTube credentials require non-empty email and password');
  }
  return { email: credentials.email.trim(), password: credentials.password };
}

export async function applyYouTubeAuth(
  context: BrowserContext,
  input: YouTubeAuthInput,
): Promise<YouTubeAuthResult> {
  const { cookies: preparsed, cookiesFile, credentials } = input;

  if (preparsed === undefined && cookiesFile === undefined && credentials === undefined) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  if (preparsed !== undefined || cookiesFile !== undefined) {
    const cookies = preparsed !== undefined ? preparsed : await loadCookies(cookiesFile as string);

    const warmupPage = context.pages()[0] ?? (await context.newPage());
    await warmupPage.goto(YOUTUBE.urls.youtube, { waitUntil: 'domcontentloaded' });
    await warmupPage.close();

    const { added, skipped } = await applyCookies(context, cookies);

    return {
      ok: added > 0,
      cookiesApplied: added,
      ...(skipped > 0 && { reason: `${skipped} cookies skipped` }),
    };
  }

  const page = context.pages()[0] ?? (await context.newPage());
  try {
    const validCredentials = requireCredentials(credentials);
    await loginWithCredentials(page, validCredentials.email, validCredentials.password);
    const confirmed = await isLoggedIn(page);
    if (!confirmed) {
      return {
        ok: false,
        reason:
          'Google login was submitted but could not be confirmed; complete any challenge manually or use cookies',
        cookiesApplied: 0,
      };
    }
    return { ok: true, cookiesApplied: 1 };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), cookiesApplied: 0 };
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(YOUTUBE.urls.studio, { waitUntil: 'domcontentloaded' });

    // 1. URL check — Studio redirects to accounts.google.com/signin if not logged in
    try {
      const url = page.url();
      if (url.includes('accounts.google.com') || url.includes('/signin')) return false;
    } catch {
      // url() unavailable; continue to cookie and DOM checks.
    }

    // 2. Cookie check — SAPISID is Google's cross-property auth cookie (set for youtube.com + google.com)
    try {
      const cookies = await page.context().cookies(YOUTUBE.urls.youtube);
      const hasSapisid = cookies.some(
        (cookie) =>
          (cookie.name === 'SAPISID' || cookie.name === '__Secure-3PSID') &&
          cookie.value.length > 0,
      );
      if (hasSapisid) return true;
    } catch {
      // Cookie API unavailable; fall through to DOM check.
    }

    // 3. DOM selector check — Polymer custom elements in Studio are reasonably stable
    return waitForAnyVisible(
      page,
      Object.values(YOUTUBE.selectors.loginIndicators),
      YOUTUBE.timeouts.mediumMs,
    );
  } catch {
    return false;
  }
}

export async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await fillLoginCredentials(page, email, password);
  await submitLoginCredentials(page);
}

export async function fillLoginCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(YOUTUBE.urls.login, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector(YOUTUBE.selectors.login.email, { timeout: YOUTUBE.timeouts.shortMs });
  await page.fill(YOUTUBE.selectors.login.email, email);
  await humanClick(page, YOUTUBE.selectors.login.nextButton);

  await page.waitForSelector(YOUTUBE.selectors.login.password, {
    timeout: YOUTUBE.timeouts.shortMs,
  });
  await page.fill(YOUTUBE.selectors.login.password, password);
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  await humanClick(page, YOUTUBE.selectors.login.nextButton);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}
