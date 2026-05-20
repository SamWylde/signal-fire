import { describe, expect, it, vi } from 'vitest';

import type { PlaywrightCookie } from '../src/core/cookies.js';
import { applyLinkedInAuth, isLoggedIn } from '../src/platforms/linkedin/auth.js';
import { LINKEDIN } from '../src/platforms/linkedin/selectors.js';

// ---------------------------------------------------------------------------
// 1. applyLinkedInAuth — no inputs
// ---------------------------------------------------------------------------
describe('applyLinkedInAuth', () => {
  it('returns ok:false with reason when no input provided', async () => {
    // Context stub — should never be called
    const context = {
      newPage: vi.fn(),
      addCookies: vi.fn(),
    } as unknown as Parameters<typeof applyLinkedInAuth>[0];

    const result = await applyLinkedInAuth(context, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No auth input provided');
    expect(result.cookiesApplied).toBe(0);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 2. Cookie precedence — pre-parsed cookies win over cookiesFile
  // ---------------------------------------------------------------------------
  it('uses pre-parsed cookies and does NOT read cookiesFile when cookies is provided', async () => {
    const cookie: PlaywrightCookie = {
      name: 'li_at',
      value: 'test-token',
      domain: '.linkedin.com',
      path: '/',
    };

    const mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(null),
    };

    const context = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof applyLinkedInAuth>[0];

    // cookiesFile points to a nonexistent path — if the file were read it would throw
    const result = await applyLinkedInAuth(context, {
      cookies: [cookie],
      cookiesFile: '/nonexistent/path/that/does/not/exist.json',
    });

    // Should succeed using pre-parsed cookies, not the file
    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'li_at',
        value: 'test-token',
        domain: '.linkedin.com',
        path: '/',
      }),
    ]);
  });

  it('rejects blank credentials before submitting the login form', async () => {
    const context = {
      newPage: vi.fn().mockResolvedValue({}),
      addCookies: vi.fn(),
      pages: vi.fn().mockReturnValue([]),
    } as unknown as Parameters<typeof applyLinkedInAuth>[0];

    const result = await applyLinkedInAuth(context, {
      credentials: { username: '', password: ' ' },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('LinkedIn credentials require non-empty username and password');
  });
});

describe('isLoggedIn', () => {
  it('navigates to LinkedIn feed before checking login indicators', async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(null);
    const locator = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ waitFor }),
    });
    const page = {
      goto,
      url: vi.fn().mockReturnValue(LINKEDIN.urls.home),
      locator,
    } as unknown as Parameters<typeof isLoggedIn>[0];

    await expect(isLoggedIn(page)).resolves.toBe(true);

    expect(goto).toHaveBeenCalledWith(LINKEDIN.urls.home, {
      waitUntil: 'domcontentloaded',
    });
    expect(goto.mock.invocationCallOrder[0]).toBeLessThan(locator.mock.invocationCallOrder[0]);
  });
});
