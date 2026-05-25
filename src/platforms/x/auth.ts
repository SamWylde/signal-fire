import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import {
  type PlaywrightCookie,
  applyCookies,
  loadCookies,
  remapTwitterToX,
} from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { X } from './selectors.js';

export interface XAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  authToken?: string;
  ct0?: string;
  twid?: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface XAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

const BASE_COOKIE = {
  domain: X.domains.primary,
  path: '/',
  secure: true,
} as const;

// Build the minimal auth cookie set from raw token values.
// Exported for testing.
export function buildAuthCookies(input: {
  authToken?: string;
  ct0?: string;
  twid?: string;
}): PlaywrightCookie[] {
  const result: PlaywrightCookie[] = [];
  if (input.authToken) {
    result.push({ name: 'auth_token', value: input.authToken, httpOnly: true, ...BASE_COOKIE });
  }
  if (input.ct0) {
    result.push({ name: 'ct0', value: input.ct0, httpOnly: false, ...BASE_COOKIE });
  }
  if (input.twid) {
    result.push({ name: 'twid', value: input.twid, httpOnly: false, ...BASE_COOKIE });
  }
  return result;
}

function requireCredentials(credentials: XAuthInput['credentials']): {
  username: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.username.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('X credentials require non-empty email or username and password');
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

// Loads cookies (file/pre-parsed/raw-tokens), remaps any twitter.com -> x.com domains,
// warms up the X domain, then applies cookies. Caller verifies login separately via isLoggedIn.
export async function applyXAuth(context: BrowserContext, input: XAuthInput): Promise<XAuthResult> {
  const { cookies: preparsed, cookiesFile, authToken, ct0, twid, credentials } = input;

  if (
    preparsed === undefined &&
    cookiesFile === undefined &&
    authToken === undefined &&
    ct0 === undefined &&
    twid === undefined &&
    credentials === undefined
  ) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  if (
    preparsed === undefined &&
    cookiesFile === undefined &&
    authToken === undefined &&
    ct0 === undefined &&
    twid === undefined
  ) {
    const page = context.pages()[0] ?? (await context.newPage());
    try {
      const validCredentials = requireCredentials(credentials);
      await loginWithCredentials(page, validCredentials.username, validCredentials.password);
      const confirmed = await isLoggedIn(page);
      if (!confirmed) {
        return {
          ok: false,
          reason:
            'X login was submitted but could not be confirmed; complete any challenge manually or use cookies',
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
    cookies = buildAuthCookies({
      ...(authToken !== undefined && { authToken }),
      ...(ct0 !== undefined && { ct0 }),
      ...(twid !== undefined && { twid }),
    });
  }

  // Always remap twitter.com -> x.com before applying.
  cookies = remapTwitterToX(cookies);

  // Warmup: establish the X domain in the browser before injecting cookies.
  const warmupPage = await context.newPage();
  await warmupPage.goto(X.urls.home, { waitUntil: 'domcontentloaded' });
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
    await page.goto(X.urls.home, { waitUntil: 'domcontentloaded' });

    // 1. URL check — if redirected to /i/flow/login or /login, definitely logged out
    const url = page.url();
    if (url.includes('/login') || url.includes('/i/flow/login')) return false;

    // 2. Cookie check — auth_token + ct0 together are X's decisive auth signal
    const cookies = await page.context().cookies(X.urls.home);
    const cookieMap = new Map(
      cookies.filter((c) => c.value.length > 0).map((c) => [c.name, c.value]),
    );
    if (cookieMap.has('auth_token') && cookieMap.has('ct0')) return true;

    // 3. DOM selector check — data-testid attributes are more stable than class names on X
    return waitForAnyVisible(page, Object.values(X.selectors.loginIndicators), 8_000);
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
  await page.goto(X.urls.login, { waitUntil: 'domcontentloaded' });

  await page
    .locator(X.selectors.login.usernameInput)
    .first()
    .waitFor({ state: 'visible', timeout: X.timeouts.mediumMs });
  await typeIntoField(page, X.selectors.login.usernameInput, username, X.timeouts.mediumMs);
  const nextButton = page.locator(X.selectors.login.nextButton).first();
  await nextButton.waitFor({ state: 'visible', timeout: X.timeouts.shortMs });
  await humanClick(page, nextButton);

  try {
    await page
      .locator(X.selectors.login.passwordInput)
      .first()
      .waitFor({ state: 'visible', timeout: X.timeouts.shortMs });
  } catch {
    await typeIntoField(
      page,
      X.selectors.login.alternateIdentifierInput,
      username,
      X.timeouts.shortMs,
    );
    const nextButton = page.locator(X.selectors.login.nextButton).first();
    await nextButton.waitFor({ state: 'visible', timeout: X.timeouts.shortMs });
    await humanClick(page, nextButton);
    await page
      .locator(X.selectors.login.passwordInput)
      .first()
      .waitFor({ state: 'visible', timeout: X.timeouts.mediumMs });
  }

  await typeIntoField(page, X.selectors.login.passwordInput, password, X.timeouts.mediumMs);
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  const loginButton = page.locator(X.selectors.login.loginButton).first();
  await loginButton.waitFor({ state: 'visible', timeout: X.timeouts.shortMs });
  await humanClick(page, loginButton);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}
