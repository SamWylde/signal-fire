// Read-only composer probe for LinkedIn. Confirms the composer surface still resolves WITHOUT
// publishing anything: it navigates to the feed, clicks the "Start a post" trigger to open
// the share modal, and asserts the key selectors are visible. It NEVER types, attaches media,
// schedules, or clicks the Post button.

import type { Page } from '../../core/browser.js';
import { waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { LINKEDIN } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow the modal to appear after clicking the trigger
const SECONDARY_TIMEOUT_MS = 2_500; // page is already loaded; secondary checks are fast

/**
 * LinkedIn has no direct compose URL. We navigate to the feed and click the "Start a post"
 * button which opens the share modal — this is the open step only; we never type or submit.
 * We assert the share modal (primary readiness signal) and the text editor are visible.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(LINKEDIN.urls.home, { waitUntil: 'domcontentloaded' });

  // Click the "Start a post" trigger to open the share modal.
  const triggerSelectors = [
    LINKEDIN.selectors.composer.startPostTriggerAria,
    LINKEDIN.selectors.companyPage.startPostTrigger,
    `xpath=${LINKEDIN.selectors.companyPage.startPostTriggerXPath}`,
    LINKEDIN.selectors.composer.startPostTrigger,
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
      selectors: [LINKEDIN.selectors.composer.modal, LINKEDIN.selectors.composer.modalAria],
      timeoutMs: PRIMARY_TIMEOUT_MS,
    },
    {
      name: 'composer.textEditor',
      selectors: [
        LINKEDIN.selectors.composer.textEditorAria,
        LINKEDIN.selectors.composer.textEditor,
        LINKEDIN.selectors.companyShare.textEditor,
      ],
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
