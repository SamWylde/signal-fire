// Read-only composer probe for Instagram. Confirms the upload surface still resolves WITHOUT
// publishing anything: it navigates to the home feed, clicks the "New post" sidebar trigger
// to open the create modal, and asserts the key selectors are visible. It NEVER types,
// attaches media, schedules, or clicks the Share button.

import type { Page } from '../../core/browser.js';
import { waitForAnyAttached, waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { INSTAGRAM } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow the modal to appear after clicking the trigger
const SECONDARY_TIMEOUT_MS = 2_500; // page is already loaded; secondary checks are fast

/**
 * Instagram has no direct compose URL. We navigate to home and click the "New post" sidebar
 * link which opens the "Create new post" modal — this is the open step only; we never attach
 * a file or submit. We assert the create modal (primary readiness signal) and the file input
 * are reachable — the file input is checked for reachability (attached) only, never used.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(INSTAGRAM.urls.home, { waitUntil: 'domcontentloaded' });

  // Click the "New post" sidebar trigger to open the create modal.
  const triggerSelectors = [INSTAGRAM.selectors.composer.newPostTrigger, "a[href*='/create']"];
  for (const selector of triggerSelectors) {
    const trigger = page.locator(selector).first();
    const clicked = await trigger
      .waitFor({ state: 'visible', timeout: PRIMARY_TIMEOUT_MS })
      .then(() => trigger.click())
      .then(() => true)
      .catch(() => false);
    if (clicked) break;
  }

  // Some Instagram variants show an intermediate Create menu before the modal.
  const postMenuItem = page.locator(INSTAGRAM.selectors.composer.postMenuItem).first();
  await postMenuItem
    .waitFor({ state: 'visible', timeout: SECONDARY_TIMEOUT_MS })
    .then(() => postMenuItem.click())
    .catch(() => undefined);

  const checks: Array<{
    name: string;
    selector: string;
    timeoutMs: number;
    state: 'attached' | 'visible';
  }> = [
    {
      name: 'composer.createModal',
      selector: INSTAGRAM.selectors.composer.createModal,
      timeoutMs: PRIMARY_TIMEOUT_MS,
      state: 'visible',
    },
    {
      name: 'composer.fileInput',
      selector: INSTAGRAM.selectors.composer.fileInput,
      timeoutMs: SECONDARY_TIMEOUT_MS,
      state: 'attached',
    },
  ];

  const checkedSelectors: string[] = [];
  const missingSelectors: string[] = [];
  for (const check of checks) {
    checkedSelectors.push(check.name);
    const found =
      check.state === 'attached'
        ? await waitForAnyAttached(page, [check.selector], check.timeoutMs)
        : await waitForAnyVisible(page, [check.selector], check.timeoutMs);
    if (!found) missingSelectors.push(check.name);
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
