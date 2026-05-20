import { describe, expect, it, vi } from 'vitest';

import type { PlaywrightCookie } from '../src/core/cookies.js';
import { applyFacebookAuth, isLoggedIn } from '../src/platforms/facebook/auth.js';
import { FACEBOOK } from '../src/platforms/facebook/selectors.js';

// ---------------------------------------------------------------------------
// 1. applyFacebookAuth — no inputs
// ---------------------------------------------------------------------------
describe('applyFacebookAuth', () => {
  it('returns ok:false with reason when no input provided', async () => {
    // Context stub — should never be called
    const context = {
      newPage: vi.fn(),
      addCookies: vi.fn(),
    } as unknown as Parameters<typeof applyFacebookAuth>[0];

    const result = await applyFacebookAuth(context, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No auth input provided');
    expect(result.cookiesApplied).toBe(0);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 2. Cookie path precedence — pre-parsed cookies win over cookiesFile
  // ---------------------------------------------------------------------------
  it('uses pre-parsed cookies and does NOT read cookiesFile when cookies is provided', async () => {
    const cookie: PlaywrightCookie = {
      name: 'c_user',
      value: '12345',
      domain: '.facebook.com',
      path: '/',
    };

    const mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(null),
    };

    const context = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([]),
    } as unknown as Parameters<typeof applyFacebookAuth>[0];

    // cookiesFile points to a nonexistent path — if the file were read it would throw
    const result = await applyFacebookAuth(context, {
      cookies: [cookie],
      cookiesFile: '/nonexistent/path/that/does/not/exist.json',
    });

    // Should succeed using pre-parsed cookies, not the file
    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'c_user',
        value: '12345',
        domain: '.facebook.com',
        path: '/',
      }),
    ]);
    // Warmup page was opened and closed
    expect(mockPage.goto).toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('rejects blank credentials before submitting the login form', async () => {
    const context = {
      newPage: vi.fn().mockResolvedValue({}),
      addCookies: vi.fn(),
      pages: vi.fn().mockReturnValue([]),
    } as unknown as Parameters<typeof applyFacebookAuth>[0];

    const result = await applyFacebookAuth(context, {
      credentials: { email: '', password: '   ' },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Facebook credentials require non-empty email and password');
  });
});

describe('isLoggedIn', () => {
  it('navigates to Facebook home before checking login indicators', async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(null);
    const locator = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ waitFor }),
    });
    const page = {
      goto,
      locator,
    } as unknown as Parameters<typeof isLoggedIn>[0];

    await expect(isLoggedIn(page)).resolves.toBe(true);

    expect(goto).toHaveBeenCalledWith(FACEBOOK.urls.home, {
      waitUntil: 'domcontentloaded',
    });
    expect(goto.mock.invocationCallOrder[0]).toBeLessThan(locator.mock.invocationCallOrder[0]);
  });
});
