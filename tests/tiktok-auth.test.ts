import { describe, expect, it, vi } from 'vitest';

import type { PlaywrightCookie } from '../src/core/cookies.js';
import { applyTikTokAuth, buildSessionIdCookie, isLoggedIn } from '../src/platforms/tiktok/auth.js';
import { TIKTOK } from '../src/platforms/tiktok/selectors.js';

// ---------------------------------------------------------------------------
// 1. buildSessionIdCookie
// ---------------------------------------------------------------------------
describe('buildSessionIdCookie', () => {
  it('returns a cookie with name sessionid and the provided value', () => {
    const cookie = buildSessionIdCookie('my-session-value');
    expect(cookie.name).toBe('sessionid');
    expect(cookie.value).toBe('my-session-value');
  });

  it('sets domain to .tiktok.com', () => {
    const cookie = buildSessionIdCookie('x');
    expect(cookie.domain).toBe('.tiktok.com');
  });

  it('sets httpOnly and secure flags', () => {
    const cookie = buildSessionIdCookie('x');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
  });

  it('sets path to /', () => {
    const cookie = buildSessionIdCookie('x');
    expect(cookie.path).toBe('/');
  });
});

// ---------------------------------------------------------------------------
// 2. applyTikTokAuth — empty input
// ---------------------------------------------------------------------------
describe('applyTikTokAuth', () => {
  it('returns ok:false with reason when no input provided', async () => {
    // Context stub — should never be called
    const context = {
      newPage: vi.fn(),
      addCookies: vi.fn(),
    } as unknown as Parameters<typeof applyTikTokAuth>[0];

    const result = await applyTikTokAuth(context, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No auth input provided');
    expect(result.cookiesApplied).toBe(0);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  it('applies pre-parsed cookies and returns cookiesApplied count', async () => {
    const cookie: PlaywrightCookie = {
      name: 'sessionid',
      value: 'abc',
      domain: '.tiktok.com',
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
    } as unknown as Parameters<typeof applyTikTokAuth>[0];

    const result = await applyTikTokAuth(context, { cookies: [cookie] });
    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'sessionid',
        value: 'abc',
        domain: '.tiktok.com',
        path: '/',
      }),
    ]);
    // Warmup page was opened and closed
    expect(mockPage.goto).toHaveBeenCalled();
    expect(mockPage.close).toHaveBeenCalled();
  });

  it('uses sessionId shortcut when only sessionId provided', async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(null),
    };

    const context = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([]),
    } as unknown as Parameters<typeof applyTikTokAuth>[0];

    const result = await applyTikTokAuth(context, { sessionId: 'sess-xyz' });
    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(1);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'sessionid',
        value: 'sess-xyz',
        domain: '.tiktok.com',
        path: '/',
        httpOnly: true,
        secure: true,
      }),
    ]);
  });
});

describe('isLoggedIn', () => {
  it('uses positive TikTok login indicators instead of absence of the login button', async () => {
    const waitFor = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(null);
    const locator = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ waitFor }),
    });
    const page = {
      goto,
      locator,
      waitForSelector: vi.fn(),
    } as unknown as Parameters<typeof isLoggedIn>[0];

    await expect(isLoggedIn(page)).resolves.toBe(true);

    expect(goto).toHaveBeenCalledWith(TIKTOK.urls.home, {
      waitUntil: 'domcontentloaded',
    });
    expect(locator).not.toHaveBeenCalledWith('//a[contains(@href, "/login")]');
  });
});
