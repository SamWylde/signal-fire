import { describe, expect, it, vi } from 'vitest';

import type { PlaywrightCookie } from '../src/core/cookies.js';
import { applyYouTubeAuth, isLoggedIn } from '../src/platforms/youtube/auth.js';
import { YOUTUBE } from '../src/platforms/youtube/selectors.js';

// ---------------------------------------------------------------------------
// 1. applyYouTubeAuth — no inputs
// ---------------------------------------------------------------------------
describe('applyYouTubeAuth', () => {
  it('returns ok:false with reason when no input provided', async () => {
    // Context stub — should never be called
    const context = {
      newPage: vi.fn(),
      addCookies: vi.fn(),
    } as unknown as Parameters<typeof applyYouTubeAuth>[0];

    const result = await applyYouTubeAuth(context, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No auth input provided');
    expect(result.cookiesApplied).toBe(0);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 2. Cookie precedence — pre-parsed wins over cookiesFile; no file read attempted
  // ---------------------------------------------------------------------------
  it('uses pre-parsed cookies and does NOT read cookiesFile when cookies is provided', async () => {
    const cookie: PlaywrightCookie = {
      name: 'SAPISID',
      value: 'abc123',
      domain: '.google.com',
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
    } as unknown as Parameters<typeof applyYouTubeAuth>[0];

    // cookiesFile points to a nonexistent path — if the file were read it would throw
    const result = await applyYouTubeAuth(context, {
      cookies: [cookie],
      cookiesFile: '/nonexistent/path/that/does/not/exist.json',
    });

    // Should succeed using pre-parsed cookies, not the file
    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'SAPISID',
        value: 'abc123',
        domain: '.google.com',
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
    } as unknown as Parameters<typeof applyYouTubeAuth>[0];

    const result = await applyYouTubeAuth(context, {
      credentials: { email: ' ', password: '' },
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('YouTube credentials require non-empty email and password');
  });
});

describe('isLoggedIn', () => {
  it('navigates to YouTube Studio before checking login indicators', async () => {
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

    expect(goto).toHaveBeenCalledWith(YOUTUBE.urls.studio, {
      waitUntil: 'domcontentloaded',
    });
    expect(goto.mock.invocationCallOrder[0]).toBeLessThan(locator.mock.invocationCallOrder[0]);
  });
});
