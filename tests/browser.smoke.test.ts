// LIVE BROWSER TESTS — opt-in only.
// These tests launch real Chrome via Patchright and will steal focus during the run.
// To enable: set RUN_LIVE_BROWSER_TESTS=1 in your environment, then run pnpm test.
// PowerShell: $env:RUN_LIVE_BROWSER_TESTS='1'; pnpm test
// Bash:       RUN_LIVE_BROWSER_TESTS=1 pnpm test
import { describe, expect, it } from 'vitest';
import { findChromeExecutable, launchBrowser } from '../src/core/browser.js';

const hasChrome = findChromeExecutable() !== null;
const runLive = process.env.RUN_LIVE_BROWSER_TESTS === '1';

describe.skipIf(!hasChrome || !runLive)('launchBrowser smoke', () => {
  it('launches a real-machine context with automation cleanup', async () => {
    const { context, fingerprint, close } = await launchBrowser({
      accountId: 'smoke-test',
      platform: 'x',
    });
    try {
      const page = await context.newPage();
      await page.goto('about:blank');
      expect(await page.title()).toBe('');
      expect(fingerprint).toBeUndefined();
      expect(await page.evaluate(() => typeof navigator.webdriver)).toBe('undefined');
      expect(await page.evaluate(() => navigator.userAgent)).not.toContain('HeadlessChrome');
    } finally {
      await close();
    }
  }, 30_000);
});
