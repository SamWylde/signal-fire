import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import { type PlaywrightCookie, applyCookies, loadCookies } from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { TIKTOK } from './selectors.js';

export interface TikTokAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  sessionId?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface TikTokAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

export function buildSessionIdCookie(sessionId: string): PlaywrightCookie {
  return {
    name: 'sessionid',
    value: sessionId,
    domain: '.tiktok.com',
    path: '/',
    httpOnly: true,
    secure: true,
  };
}

function requireCredentials(credentials: TikTokAuthInput['credentials']): {
  username: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.username.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('TikTok credentials require non-empty email or username and password');
  }
  return { username: credentials.username.trim(), password: credentials.password };
}

async function typeIntoField(
  page: Page,
  selector: string,
  value: string,
  timeout: number,
): Promise<void> {
  const field = page.locator(selector).first();
  await field.waitFor({ state: 'visible', timeout });
  await humanClick(page, field);
  await field.fill('').catch(() => undefined);
  const typeableField = field as typeof field & {
    pressSequentially?: (text: string, options?: { delay?: number }) => Promise<void>;
  };
  if (typeof typeableField.pressSequentially === 'function') {
    await typeableField.pressSequentially(value, { delay: 25 });
  } else {
    await field.fill(value);
  }

  if ((await field.inputValue().catch(() => '')) !== value) {
    await field.evaluate((node, text) => {
      if (!(node instanceof HTMLInputElement)) return;
      node.value = text;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }
}

export async function applyTikTokAuth(
  context: BrowserContext,
  input: TikTokAuthInput,
): Promise<TikTokAuthResult> {
  const { cookies: preparsed, cookiesFile, sessionId, credentials } = input;

  if (
    preparsed === undefined &&
    cookiesFile === undefined &&
    sessionId === undefined &&
    credentials === undefined
  ) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  if (preparsed === undefined && cookiesFile === undefined && sessionId === undefined) {
    const page = context.pages()[0] ?? (await context.newPage());
    try {
      const validCredentials = requireCredentials(credentials);
      await loginWithCredentials(page, validCredentials.username, validCredentials.password);
      const confirmed = await isLoggedIn(page);
      if (!confirmed) {
        return {
          ok: false,
          reason:
            'TikTok login was submitted but could not be confirmed; complete any challenge manually or use cookies',
          cookiesApplied: 0,
        };
      }
      return { ok: true, cookiesApplied: 1 };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e), cookiesApplied: 0 };
    }
  }

  let cookies: PlaywrightCookie[];

  if (preparsed !== undefined) {
    cookies = preparsed;
  } else if (cookiesFile !== undefined) {
    cookies = await loadCookies(cookiesFile);
  } else {
    // sessionId is defined here because of the guard above.
    cookies = [buildSessionIdCookie(sessionId as string)];
  }

  // Warm up the TikTok domain before injecting cookies.
  const warmupPage = await context.newPage();
  await warmupPage.goto(TIKTOK.urls.home, { waitUntil: 'domcontentloaded' });
  await warmupPage.close();

  const { added, skipped } = await applyCookies(context, cookies);

  return {
    ok: added > 0,
    cookiesApplied: added,
    ...(skipped > 0 && { reason: `${skipped} cookies skipped` }),
  };
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(TIKTOK.urls.home, { waitUntil: 'domcontentloaded' });

    // 1. Cookie check — sessionid or sid_tt are TikTok's auth cookies (region-dependent)
    try {
      const cookies = await page.context().cookies(TIKTOK.urls.home);
      const hasTikTokSession = cookies.some(
        (cookie) =>
          (cookie.name === 'sessionid' || cookie.name === 'sid_tt') && cookie.value.length > 0,
      );
      if (hasTikTokSession) return true;
    } catch {
      // Cookie API unavailable; fall through to DOM check.
    }

    // 2. URL check — if redirected to login, we're definitely logged out
    try {
      const url = page.url();
      if (url.includes('/login')) return false;
    } catch {
      // url() unavailable; continue to DOM check.
    }

    // 3. DOM selector check — TikTok A/B tests selectors frequently; use multiple
    const homeIndicator = await waitForAnyVisible(
      page,
      Object.values(TIKTOK.selectors.loginIndicators),
      8_000,
    );
    if (homeIndicator) return true;

    // 4. Upload page check — authenticated users can access the creator center
    await page.goto(TIKTOK.urls.upload, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root', { timeout: 8_000 }).catch(() => {
      // The upload page may redirect to login before the app root appears.
    });
    return waitForAnyVisible(
      page,
      [TIKTOK.selectors.upload.uploadVideo, TIKTOK.selectors.upload.description],
      8_000,
    );
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
}

export async function fillLoginCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(TIKTOK.urls.login, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(TIKTOK.selectors.login.usernameField, {
    timeout: TIKTOK.timeouts.implicitWaitMs,
  });
  await typeIntoField(
    page,
    TIKTOK.selectors.login.usernameField,
    username,
    TIKTOK.timeouts.implicitWaitMs,
  );
  await typeIntoField(
    page,
    TIKTOK.selectors.login.passwordField,
    password,
    TIKTOK.timeouts.implicitWaitMs,
  );
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  await page.waitForSelector(TIKTOK.selectors.login.loginButton, {
    timeout: TIKTOK.timeouts.implicitWaitMs,
  });
  await humanClick(page, TIKTOK.selectors.login.loginButton);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}
