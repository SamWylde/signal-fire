import { type BrowserContext, type Page, waitForAnyVisible } from '../../core/browser.js';
import { type PlaywrightCookie, applyCookies, loadCookies } from '../../core/cookies.js';
import { humanClick } from '../../core/mouse.js';
import { LINKEDIN } from './selectors.js';

export interface LinkedInAuthInput {
  cookiesFile?: string;
  cookies?: PlaywrightCookie[];
  // Form-fill fallback. Will fail on 2FA accounts unless caller drives checkpoint manually.
  credentials?: {
    username: string; // email or phone (LinkedIn uses 'username' field for both)
    password: string;
  };
  // If true, after form-fill if a checkpoint URL is reached, waits up to checkpointMs for the user
  // to complete it in a headed browser. Default false (fail fast).
  allowInteractiveCheckpoint?: boolean;
}

export interface LinkedInAuthResult {
  ok: boolean;
  reason?: string;
  cookiesApplied: number;
}

function requireCredentials(credentials: LinkedInAuthInput['credentials']): {
  username: string;
  password: string;
} {
  if (
    credentials === undefined ||
    credentials.username.trim().length === 0 ||
    credentials.password.trim().length === 0
  ) {
    throw new Error('LinkedIn credentials require non-empty username and password');
  }
  return { username: credentials.username.trim(), password: credentials.password };
}

// Orchestrates whichever auth path the caller supplied. Cookie modes win over credentials.
// Caller verifies login with isLoggedIn() afterward.
export async function applyLinkedInAuth(
  context: BrowserContext,
  input: LinkedInAuthInput,
): Promise<LinkedInAuthResult> {
  const { cookies: preparsed, cookiesFile, credentials, allowInteractiveCheckpoint } = input;

  if (preparsed === undefined && cookiesFile === undefined && credentials === undefined) {
    return { ok: false, reason: 'No auth input provided', cookiesApplied: 0 };
  }

  // Cookie path (preparsed > cookiesFile)
  if (preparsed !== undefined || cookiesFile !== undefined) {
    let cookies: PlaywrightCookie[];

    if (preparsed !== undefined) {
      cookies = preparsed;
    } else {
      cookies = await loadCookies(cookiesFile as string);
    }

    const { added, skipped } = await applyCookies(context, cookies, LINKEDIN.urls.home);

    return {
      ok: added > 0,
      cookiesApplied: added,
      ...(skipped > 0 && { reason: `${skipped} cookies skipped` }),
    };
  }

  // Form-fill path
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    const validCredentials = requireCredentials(credentials);
    await loginWithCredentials(
      page,
      validCredentials.username,
      validCredentials.password,
      allowInteractiveCheckpoint === true ? { allowInteractiveCheckpoint: true } : undefined,
    );

    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      return {
        ok: false,
        reason: 'LinkedIn login was submitted but no logged-in indicator appeared',
        cookiesApplied: 0,
      };
    }

    return { ok: true, cookiesApplied: 1 };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e), cookiesApplied: 0 };
  }
}

// Looks for any positive login indicator. Returns true on first match.
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto(LINKEDIN.urls.home, { waitUntil: 'domcontentloaded' });

    if (page.url().includes('/feed')) {
      const visible = await waitForAnyVisible(
        page,
        Object.values(LINKEDIN.selectors.loginIndicators),
        8_000,
      );
      if (visible) return true;
    }

    const domVisible = await waitForAnyVisible(
      page,
      Object.values(LINKEDIN.selectors.loginIndicators),
      8_000,
    );
    if (domVisible) return true;

    // Cookie fallback: li_at is LinkedIn's primary auth cookie.
    // If DOM selectors are stale this still detects an active session.
    const cookies = await page.context().cookies(LINKEDIN.urls.home);
    const cookieNames = new Set(
      cookies.filter((cookie) => cookie.value.length > 0).map((cookie) => cookie.name),
    );
    return cookieNames.has('li_at');
  } catch {
    return false;
  }
}

// Form-fill login. Throws on checkpoint if allowInteractiveCheckpoint is false.
// Caller must verify via isLoggedIn because wrong credentials often remain on the same page.
export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string,
  options?: { allowInteractiveCheckpoint?: boolean },
): Promise<void> {
  await fillLoginCredentials(page, username, password);
  await submitLoginCredentials(page);

  if (options?.allowInteractiveCheckpoint === true) {
    await waitForCheckpointCompletion(page, LINKEDIN.timeouts.checkpointMs);
  } else if (page.url().startsWith(LINKEDIN.urls.checkpoint)) {
    throw new Error(
      'LinkedIn requires checkpoint verification; pass allowInteractiveCheckpoint: true and run in headed mode',
    );
  }
}

export async function fillLoginCredentials(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto(LINKEDIN.urls.login, { waitUntil: 'domcontentloaded' });

  await page.fill(LINKEDIN.selectors.login.email, username);
  await page.fill(LINKEDIN.selectors.login.password, password);
}

export async function submitLoginCredentials(page: Page): Promise<void> {
  try {
    const submitButton = page.locator(LINKEDIN.selectors.login.submitButtonAria).first();
    await submitButton.waitFor({ state: 'visible', timeout: 3_000 });
    await humanClick(page, submitButton);
  } catch {
    const submitButton = page.locator(LINKEDIN.selectors.login.submitButtonClass).first();
    await submitButton.waitFor({ state: 'visible', timeout: 3_000 });
    await humanClick(page, submitButton);
  }

  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

// If the current URL is a checkpoint page, waits up to timeoutMs for it to clear.
// Does nothing if not on a checkpoint page. Throws on timeout.
export async function waitForCheckpointCompletion(
  page: Page,
  timeoutMs: number = LINKEDIN.timeouts.checkpointMs,
): Promise<void> {
  if (!page.url().includes('checkpoint')) return;

  await page.waitForURL((url) => !url.href.includes('checkpoint') && !url.href.includes('login'), {
    timeout: timeoutMs,
  });
}
