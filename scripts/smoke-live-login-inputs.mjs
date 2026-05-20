import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { chromium } from 'patchright';

import {
  fillLoginCredentials as fillFacebook,
  submitLoginCredentials as submitFacebook,
} from '../dist/platforms/facebook/auth.js';
import { FACEBOOK } from '../dist/platforms/facebook/selectors.js';
import {
  fillLoginCredentials as fillInstagram,
  submitLoginCredentials as submitInstagram,
} from '../dist/platforms/instagram/auth.js';
import { INSTAGRAM } from '../dist/platforms/instagram/selectors.js';
import {
  fillLoginCredentials as fillLinkedIn,
  submitLoginCredentials as submitLinkedIn,
} from '../dist/platforms/linkedin/auth.js';
import { LINKEDIN } from '../dist/platforms/linkedin/selectors.js';
import {
  fillLoginCredentials as fillTikTok,
  submitLoginCredentials as submitTikTok,
} from '../dist/platforms/tiktok/auth.js';
import { TIKTOK } from '../dist/platforms/tiktok/selectors.js';
import {
  fillLoginCredentials as fillX,
  submitLoginCredentials as submitX,
} from '../dist/platforms/x/auth.js';
import { X } from '../dist/platforms/x/selectors.js';
import {
  fillLoginCredentials as fillYouTube,
  submitLoginCredentials as submitYouTube,
} from '../dist/platforms/youtube/auth.js';
import { YOUTUBE } from '../dist/platforms/youtube/selectors.js';

const startedAt = new Date();
const artifactDir = path.join(
  process.cwd(),
  'artifacts',
  'live-login-inputs',
  startedAt.toISOString().replace(/[:.]/g, '-'),
);
await fs.mkdir(artifactDir, { recursive: true });

const identity =
  process.env.SIGNAL_FIRE_LOGIN_TEST_IDENTITY ?? `signal.fire.test.${Date.now()}@example.com`;
const password = process.env.SIGNAL_FIRE_LOGIN_TEST_PASSWORD ?? `NotARealPassword-${Date.now()}!`;
const xIdentity = process.env.SIGNAL_FIRE_X_TEST_IDENTITY ?? identity;
const youtubeIdentity = process.env.SIGNAL_FIRE_YOUTUBE_TEST_IDENTITY ?? identity;
const requestedPlatforms = (process.env.SIGNAL_FIRE_LOGIN_PLATFORMS ?? '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter((item) => item.length > 0);
const headed = true;

async function screenshot(page, platform, suffix) {
  const file = path.join(artifactDir, `${platform}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => undefined);
  return file;
}

async function saveDiagnostics(page, platform, suffix) {
  const domFile = path.join(artifactDir, `${platform}-${suffix}-dom.json`);
  const htmlFile = path.join(artifactDir, `${platform}-${suffix}.html`);
  const elements = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll('input, button, [role="button"], a'))
        .slice(0, 140)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            name: element.getAttribute('name') || undefined,
            type: element.getAttribute('type') || undefined,
            role: element.getAttribute('role') || undefined,
            testId: element.getAttribute('data-testid') || undefined,
            ariaLabel: element.getAttribute('aria-label') || undefined,
            autocomplete: element.getAttribute('autocomplete') || undefined,
            placeholder: element.getAttribute('placeholder') || undefined,
            href: element.getAttribute('href') || undefined,
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              window.getComputedStyle(element).visibility !== 'hidden' &&
              window.getComputedStyle(element).display !== 'none',
          };
        }),
    )
    .catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  await fs.writeFile(domFile, JSON.stringify({ url: page.url(), elements }, null, 2));
  await fs.writeFile(htmlFile, await page.content().catch(() => ''));
  return { domFile, htmlFile };
}

function redact(value) {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function pass(platform, detail = {}) {
  return { platform, ok: true, detail };
}

function fail(platform, error, detail = {}) {
  return {
    platform,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    detail,
  };
}

async function withPage(browser, platform, fn) {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1365, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  try {
    return await fn(page);
  } catch (error) {
    const shot = await screenshot(page, platform, 'failure');
    const diagnostics = await saveDiagnostics(page, platform, 'failure');
    return fail(platform, error, { screenshot: shot, url: page.url(), ...diagnostics });
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function inputValue(page, selector) {
  return page.locator(selector).first().inputValue();
}

async function verifyFields(page, checks) {
  const values = {};
  for (const check of checks) {
    const actual = await inputValue(page, check.selector);
    values[check.name] = redact(actual);
    if (actual !== check.expected) {
      throw new Error(`${check.name} did not retain the expected fake value`);
    }
  }
  return values;
}

async function smokePlatform(browser, config) {
  console.log(`[live-login] ${config.platform}: opening live login page`);
  return withPage(browser, config.platform, async (page) => {
    await config.fill(page);
    const filledValues = await verifyFields(page, config.checks);
    const filledScreenshot = await screenshot(page, config.platform, '01-filled');
    const filledDiagnostics = await saveDiagnostics(page, config.platform, '01-filled');

    console.log(`[live-login] ${config.platform}: fake details filled; clicking submit`);
    await config.submit(page);
    await page.waitForTimeout(config.afterSubmitWaitMs ?? 3_000);
    const submittedScreenshot = await screenshot(page, config.platform, '02-after-submit');
    const submittedDiagnostics = await saveDiagnostics(page, config.platform, '02-after-submit');

    return pass(config.platform, {
      url: page.url(),
      filledValues,
      filledScreenshot,
      submittedScreenshot,
      filledDom: filledDiagnostics.domFile,
      submittedDom: submittedDiagnostics.domFile,
    });
  });
}

async function run() {
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 80,
  });

  try {
    const configs = [
      {
        platform: 'facebook',
        fill: (page) => fillFacebook(page, identity, password),
        submit: submitFacebook,
        checks: [
          { name: 'identity', selector: FACEBOOK.selectors.login.email, expected: identity },
          { name: 'password', selector: FACEBOOK.selectors.login.password, expected: password },
        ],
      },
      {
        platform: 'instagram',
        fill: (page) => fillInstagram(page, identity, password),
        submit: submitInstagram,
        checks: [
          { name: 'identity', selector: INSTAGRAM.selectors.login.username, expected: identity },
          { name: 'password', selector: INSTAGRAM.selectors.login.password, expected: password },
        ],
      },
      {
        platform: 'linkedin',
        fill: (page) => fillLinkedIn(page, identity, password),
        submit: submitLinkedIn,
        checks: [
          { name: 'identity', selector: LINKEDIN.selectors.login.email, expected: identity },
          { name: 'password', selector: LINKEDIN.selectors.login.password, expected: password },
        ],
      },
      {
        platform: 'tiktok',
        fill: (page) => fillTikTok(page, identity, password),
        submit: submitTikTok,
        checks: [
          { name: 'identity', selector: TIKTOK.selectors.login.usernameField, expected: identity },
          { name: 'password', selector: TIKTOK.selectors.login.passwordField, expected: password },
        ],
      },
      {
        platform: 'x',
        fill: (page) => fillX(page, xIdentity, password),
        submit: submitX,
        checks: [
          { name: 'password', selector: X.selectors.login.passwordInput, expected: password },
        ],
      },
      {
        platform: 'youtube',
        fill: (page) => fillYouTube(page, youtubeIdentity, password),
        submit: submitYouTube,
        checks: [
          { name: 'password', selector: YOUTUBE.selectors.login.password, expected: password },
        ],
      },
    ];

    const selectedConfigs =
      requestedPlatforms.length > 0
        ? configs.filter((config) => requestedPlatforms.includes(config.platform))
        : configs;

    const results = [];
    for (const config of selectedConfigs) {
      results.push(await smokePlatform(browser, config));
    }

    const summary = {
      ok: results.every((result) => result.ok),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      headed,
      browserChannel: 'chrome',
      artifactDir,
      testIdentity: redact(identity),
      xIdentity: redact(xIdentity),
      youtubeIdentity: redact(youtubeIdentity),
      testPassword: redact(password),
      requestedPlatforms,
      results,
    };
    await fs.writeFile(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = summary.ok ? 0 : 1;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

await run();
