import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import { type PlaywrightCookie, applyCookies, loadCookies } from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { FACEBOOK } from './selectors.js';

export interface FacebookAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  credentials?: {
    email: string;
    password: string;
  };
}

export interface FacebookAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

function requireCredentials(credentials: FacebookAuthInput['credentials']): {
  email: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.email.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('Facebook credentials require non-empty email and password');
  }
  return { email: credentials.email.trim(), password: credentials.password };
}

export async function applyFacebookAuth(
  context: BrowserContext,
  input: FacebookAuthInput,
): Promise<FacebookAuthResult> {
  const { cookies: preparsed, cookiesFile, credentials } = input;

  if (preparsed === undefined && cookiesFile === undefined && credentials === undefined) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  if (preparsed !== undefined || cookiesFile !== undefined) {
    const cookies = preparsed !== undefined ? preparsed : await loadCookies(cookiesFile as string);

    const warmupPage = await context.newPage();
    await warmupPage.goto(FACEBOOK.urls.home, { waitUntil: 'domcontentloaded' });
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
          'Login was submitted but could not be confirmed; complete any challenge manually or use cookies',
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
    // 1. Cookie check — c_user + xs together are the decisive auth signal.
    // Read from the cookie store directly; no navigation needed.
    try {
      const cookies = await page.context().cookies(FACEBOOK.urls.home);
      const nowSeconds = Date.now() / 1000;
      const isValidCookie = (name: string): boolean => {
        const cookie = cookies.find((c) => c.name === name && c.value.length > 0);
        return cookie !== undefined && (cookie.expires === -1 || cookie.expires > nowSeconds);
      };
      if (isValidCookie('c_user') && isValidCookie('xs')) return true;
    } catch {
      // Cookie API unavailable; fall through to navigation-based checks.
    }

    // Cookies inconclusive — navigate to Facebook to perform DOM/URL checks.
    await page.goto(FACEBOOK.urls.home, { waitUntil: 'domcontentloaded' });

    // 2. URL check — if still on the login page, we're definitely logged out
    try {
      const url = page.url();
      if (url.includes('/login')) return false;
    } catch {
      // url() unavailable; continue to DOM check.
    }

    // 3. DOM selector check — fallback for cases where cookies aren't accessible
    const hasLoggedInChrome = await waitForAnyVisible(
      page,
      Object.values(FACEBOOK.selectors.loginIndicators),
      FACEBOOK.timeouts.mediumMs,
    );
    return hasLoggedInChrome;
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
  await page.goto(FACEBOOK.urls.login, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForSelector(FACEBOOK.selectors.cookieBanner.acceptButton, { timeout: 3_000 });
    await humanClick(page, FACEBOOK.selectors.cookieBanner.acceptButton);
  } catch {
    // Banner not present.
  }

  await page.waitForSelector(FACEBOOK.selectors.login.email, {
    timeout: FACEBOOK.timeouts.shortMs,
  });
  await page.fill(FACEBOOK.selectors.login.email, email);
  await page.fill(FACEBOOK.selectors.login.password, password);
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  const submitButton = page.locator(FACEBOOK.selectors.login.submitButton).first();
  await submitButton.waitFor({ state: 'visible', timeout: FACEBOOK.timeouts.shortMs });
  await humanClick(page, submitButton);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}
