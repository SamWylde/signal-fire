// Read-only composer probe for X. Confirms the composer surface still resolves WITHOUT
// publishing anything: it opens the composer and asserts the key selectors are visible.
// It NEVER types, attaches media, schedules, or clicks the post button.

import type { Page } from '../../core/browser.js';
import { waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { X } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow the composer to load after navigation
const SECONDARY_TIMEOUT_MS = 2_500; // page is already loaded; secondary checks are fast

/**
 * Navigating directly to the compose URL opens the composer modal without any click.
 * We assert the text editor (primary readiness signal) and the post button are present
 * — presence only; the post button is never clicked.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(X.urls.composePost, { waitUntil: 'domcontentloaded' });

  const checks: Array<{ name: string; selector: string; timeoutMs: number }> = [
    {
      name: 'composer.textEditor',
      selector: X.selectors.composer.textEditor,
      timeoutMs: PRIMARY_TIMEOUT_MS,
    },
    {
      name: 'composer.postButton',
      selector: X.selectors.composer.postButton,
      timeoutMs: SECONDARY_TIMEOUT_MS,
    },
  ];

  const checkedSelectors: string[] = [];
  const missingSelectors: string[] = [];
  for (const check of checks) {
    checkedSelectors.push(check.name);
    const visible = await waitForAnyVisible(page, [check.selector], check.timeoutMs);
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
