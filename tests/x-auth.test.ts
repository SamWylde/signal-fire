import { describe, expect, it, vi } from 'vitest';

import { applyXAuth, buildAuthCookies } from '../src/platforms/x/auth.js';

// ---------------------------------------------------------------------------
// 1. buildAuthCookies — empty input
// ---------------------------------------------------------------------------
describe('buildAuthCookies', () => {
  it('returns [] when given empty input', () => {
    expect(buildAuthCookies({})).toEqual([]);
  });

  it('returns 1 cookie for authToken only', () => {
    const cookies = buildAuthCookies({ authToken: 'abc' });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('auth_token');
    expect(cookies[0]?.value).toBe('abc');
    expect(cookies[0]?.domain).toBe('.x.com');
    expect(cookies[0]?.secure).toBe(true);
    expect(cookies[0]?.httpOnly).toBe(true);
  });

  it('returns 3 cookies with correct httpOnly values for all three tokens', () => {
    const cookies = buildAuthCookies({ authToken: 'a', ct0: 'b', twid: 'c' });
    expect(cookies).toHaveLength(3);

    const authToken = cookies.find((c) => c.name === 'auth_token');
    const ct0 = cookies.find((c) => c.name === 'ct0');
    const twid = cookies.find((c) => c.name === 'twid');

    expect(authToken?.httpOnly).toBe(true);
    expect(ct0?.httpOnly).toBe(false);
    expect(twid?.httpOnly).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. applyXAuth — no input
// ---------------------------------------------------------------------------
describe('applyXAuth', () => {
  it('returns ok:false with reason when no input provided', async () => {
    const mockPage = {
      goto: vi.fn(),
      close: vi.fn(),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn(),
    } as unknown as Parameters<typeof applyXAuth>[0];

    const result = await applyXAuth(context, {});
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('No auth input provided');
    expect(result.cookiesApplied).toBe(0);
    expect(context.newPage).not.toHaveBeenCalled();
  });

  it('applies built cookies with the expected fields', async () => {
    const mockPage = {
      goto: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(null),
    };
    const context = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      addCookies: vi.fn().mockResolvedValue(undefined),
      pages: vi.fn().mockReturnValue([]),
    } as unknown as Parameters<typeof applyXAuth>[0];

    const result = await applyXAuth(context, { authToken: 'a', ct0: 'b' });

    expect(result.ok).toBe(true);
    expect(result.cookiesApplied).toBe(2);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'auth_token',
        value: 'a',
        domain: '.x.com',
        path: '/',
        httpOnly: true,
        secure: true,
      }),
    ]);
    expect(context.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'ct0',
        value: 'b',
        domain: '.x.com',
        path: '/',
        httpOnly: false,
        secure: true,
      }),
    ]);
  });
});
