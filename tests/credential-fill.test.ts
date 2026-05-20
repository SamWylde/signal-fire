import { describe, expect, it, vi } from 'vitest';

import type { Page } from '../src/core/browser.js';
import { fillLoginCredentials as fillFacebookLoginCredentials } from '../src/platforms/facebook/auth.js';
import { FACEBOOK } from '../src/platforms/facebook/selectors.js';
import { fillLoginCredentials as fillInstagramLoginCredentials } from '../src/platforms/instagram/auth.js';
import { INSTAGRAM } from '../src/platforms/instagram/selectors.js';
import { fillLoginCredentials as fillLinkedInLoginCredentials } from '../src/platforms/linkedin/auth.js';
import { LINKEDIN } from '../src/platforms/linkedin/selectors.js';
import { fillLoginCredentials as fillTikTokLoginCredentials } from '../src/platforms/tiktok/auth.js';
import { TIKTOK } from '../src/platforms/tiktok/selectors.js';
import { fillLoginCredentials as fillXLoginCredentials } from '../src/platforms/x/auth.js';
import { X } from '../src/platforms/x/selectors.js';
import { fillLoginCredentials as fillYouTubeLoginCredentials } from '../src/platforms/youtube/auth.js';
import { YOUTUBE } from '../src/platforms/youtube/selectors.js';

function mockPage(): {
  page: Page;
  locatorFills: Array<{ selector: string; value: string }>;
} {
  const locatorFills: Array<{ selector: string; value: string }> = [];
  const page = {
    goto: vi.fn().mockResolvedValue(null),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    locator: vi.fn((selector: string) => {
      let currentValue = '';
      return {
        first: vi.fn(() => ({
          waitFor: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn((value: string) => {
            currentValue = value;
            locatorFills.push({ selector, value });
            return Promise.resolve();
          }),
          inputValue: vi.fn(() => Promise.resolve(currentValue)),
          evaluate: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
        })),
      };
    }),
  } as unknown as Page;

  return { page, locatorFills };
}

describe('credential login prefills', () => {
  const identity = 'person@example.com';
  const password = 'correct horse battery staple';

  it('fills Facebook email and password without submitting', async () => {
    const { page, locatorFills } = mockPage();

    await fillFacebookLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(FACEBOOK.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(page.fill).toHaveBeenCalledWith(FACEBOOK.selectors.login.email, identity);
    expect(page.fill).toHaveBeenCalledWith(FACEBOOK.selectors.login.password, password);
    expect(page.keyboard.press).not.toHaveBeenCalled();
  });

  it('fills Instagram username and password without submitting', async () => {
    const { page } = mockPage();

    await fillInstagramLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(INSTAGRAM.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(page.fill).toHaveBeenCalledWith(INSTAGRAM.selectors.login.username, identity);
    expect(page.fill).toHaveBeenCalledWith(INSTAGRAM.selectors.login.password, password);
    expect(page.click).not.toHaveBeenCalledWith(INSTAGRAM.selectors.login.submit);
  });

  it('fills LinkedIn username and password without submitting', async () => {
    const { page } = mockPage();

    await fillLinkedInLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(LINKEDIN.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(page.fill).toHaveBeenCalledWith(LINKEDIN.selectors.login.email, identity);
    expect(page.fill).toHaveBeenCalledWith(LINKEDIN.selectors.login.password, password);
  });

  it('fills TikTok email or username and password without submitting', async () => {
    const { page, locatorFills } = mockPage();

    await fillTikTokLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(TIKTOK.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(locatorFills).toContainEqual({
      selector: TIKTOK.selectors.login.usernameField,
      value: identity,
    });
    expect(locatorFills).toContainEqual({
      selector: TIKTOK.selectors.login.passwordField,
      value: password,
    });
  });

  it('fills X username and password without final submit', async () => {
    const { page, locatorFills } = mockPage();

    await fillXLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(X.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(locatorFills).toContainEqual({
      selector: X.selectors.login.usernameInput,
      value: identity,
    });
    expect(locatorFills).toContainEqual({
      selector: X.selectors.login.passwordInput,
      value: password,
    });
  });

  it('fills YouTube email and password without final submit', async () => {
    const { page } = mockPage();

    await fillYouTubeLoginCredentials(page, identity, password);

    expect(page.goto).toHaveBeenCalledWith(YOUTUBE.urls.login, {
      waitUntil: 'domcontentloaded',
    });
    expect(page.fill).toHaveBeenCalledWith(YOUTUBE.selectors.login.email, identity);
    expect(page.fill).toHaveBeenCalledWith(YOUTUBE.selectors.login.password, password);
  });
});
