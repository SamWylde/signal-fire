// Read-only composer probe for Facebook. Confirms the composer surface still resolves WITHOUT
// publishing anything: it navigates to the home feed, clicks the inline composer trigger to
// open the modal, and asserts the key selectors are visible. It NEVER types, attaches media,
// schedules, or clicks the Post button.

import type { Page } from '../../core/browser.js';
import { waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { FACEBOOK } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow the modal to appear after clicking the trigger
const SECONDARY_TIMEOUT_MS = 2_500; // page is already loaded; secondary checks are fast

/**
 * Facebook has no direct compose URL. We navigate to the home feed and click the inline
 * "What's on your mind" placeholder which opens the composer modal — this is the open step
 * only; we never type or submit. We assert the modal (primary readiness signal) and the
 * inline trigger region are present.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(FACEBOOK.urls.home, { waitUntil: 'domcontentloaded' });

  // Click the inline placeholder to open the composer modal.
  // These are all opener controls from the real compose flow; none are submit buttons.
  const triggerSelectors = [
    FACEBOOK.selectors.composer.inlinePlaceholder,
    "div[role='button']:has-text('Create post')",
    FACEBOOK.selectors.composer.inlinePhotoVideo,
    FACEBOOK.selectors.composer.inlineRegion,
  ];
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const clicked = await trigger
      .waitFor({ state: 'visible', timeout: PRIMARY_TIMEOUT_MS })
      .then(() => trigger.click())
      .then(() => true)
      .catch(() => false);
    if (clicked) break;
  }

  const checks: Array<{ name: string; selectors: string[]; timeoutMs: number }> = [
    {
      name: 'composer.modal',
      selectors: [FACEBOOK.selectors.composer.modal, FACEBOOK.selectors.composer.modalOuter],
      timeoutMs: PRIMARY_TIMEOUT_MS,
    },
    {
      name: 'composer.textEditor',
      selectors: [FACEBOOK.selectors.composer.textEditor],
      timeoutMs: SECONDARY_TIMEOUT_MS,
    },
  ];

  const checkedSelectors: string[] = [];
  const missingSelectors: string[] = [];
  for (const check of checks) {
    checkedSelectors.push(check.name);
    const visible = await waitForAnyVisible(page, check.selectors, check.timeoutMs);
    if (!visible) missingSelectors.push(check.name);
  }

  if (missingSelectors.length === 0) {
    return { composer: 'ok', checkedSelectors, missingSelectors };
  }
  return {
    composer: 'drifted',
    checkedSelectors,
    missingSelectors,
    detail: `Composer selectors not found: ${missingSelectors.join(', ')}`,
  };
}
