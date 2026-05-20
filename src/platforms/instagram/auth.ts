import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import { type PlaywrightCookie, applyCookies, loadCookies } from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { INSTAGRAM } from './selectors.js';

export interface InstagramAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  credentials?: {
    username: string;
    password: string;
  };
}

export interface InstagramAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

function requireCredentials(credentials: InstagramAuthInput['credentials']): {
  username: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.username.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('Instagram credentials require non-empty username and password');
  }
  return { username: credentials.username.trim(), password: credentials.password };
}

export async function applyInstagramAuth(
  context: BrowserContext,
  input: InstagramAuthInput,
): Promise<InstagramAuthResult> {
  const { cookies: preparsed, cookiesFile, credentials } = input;

  if (preparsed === undefined && cookiesFile === undefined && credentials === undefined) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  if (preparsed !== undefined || cookiesFile !== undefined) {
    const cookies = preparsed !== undefined ? preparsed : await loadCookies(cookiesFile as string);

    const { added, skipped } = await applyCookies(context, cookies, INSTAGRAM.urls.home);

    return {
      ok: added > 0,
      cookiesApplied: added,
      ...(skipped > 0 && { reason: `${skipped} cookies skipped` }),
    };
  }

  const page = context.pages()[0] ?? (await context.newPage());
  try {
    const validCredentials = requireCredentials(credentials);
    await loginWithCredentials(page, validCredentials.username, validCredentials.password);
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
    await page.goto(INSTAGRAM.urls.home, { waitUntil: 'domcontentloaded' });

    // 1. Cookie check — sessionid is the decisive auth signal for Instagram
    try {
      const cookies = await page.context().cookies(INSTAGRAM.urls.home);
      if (cookies.some((cookie) => cookie.name === 'sessionid' && cookie.value.length > 0))
        return true;
    } catch {
      // Cookie API unavailable; fall through to DOM check.
    }

    // 2. URL check — if redirected to login page, definitely logged out
    try {
      const url = page.url();
      if (url.includes('/accounts/login')) return false;
    } catch {
      // url() unavailable; continue to DOM check.
    }

    // 3. DOM selector check — positive logged-in indicators
    const hasLoggedInChrome = await waitForAnyVisible(
      page,
      Object.values(INSTAGRAM.selectors.loginIndicators),
      INSTAGRAM.timeouts.mediumMs,
    );
    return hasLoggedInChrome;
  } catch {
    return false;
  }
}

export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await fillLoginCredentials(page, username, password);
  await submitLoginCredentials(page);

  try {
    await page.waitForSelector(INSTAGRAM.selectors.login.saveInfoNotNow, {
      timeout: INSTAGRAM.timeouts.shortMs,
    });
    await humanClick(page, INSTAGRAM.selectors.login.saveInfoNotNow);
  } catch {
    // Prompt not present.
  }

  try {
    await page.waitForSelector(INSTAGRAM.selectors.login.notificationsNotNow, {
      timeout: INSTAGRAM.timeouts.shortMs,
    });
    await humanClick(page, INSTAGRAM.selectors.login.notificationsNotNow);
  } catch {
    // Prompt not present.
  }
}

export async function fillLoginCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(INSTAGRAM.urls.login, { waitUntil: 'domcontentloaded' });

  await page.waitForSelector(INSTAGRAM.selectors.login.username, {
    timeout: INSTAGRAM.timeouts.mediumMs,
  });

  await page.fill(INSTAGRAM.selectors.login.username, username);
  await page.fill(INSTAGRAM.selectors.login.password, password);
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  await page.waitForSelector(INSTAGRAM.selectors.login.submit, {
    timeout: INSTAGRAM.timeouts.shortMs,
  });
  await humanClick(page, INSTAGRAM.selectors.login.submit);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}
