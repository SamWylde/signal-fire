// Read-only composer probe for TikTok. Confirms the upload surface still resolves WITHOUT
// publishing anything: it navigates to the upload page and asserts the key selectors are
// reachable. It NEVER types, attaches media, schedules, or clicks the post button.

import type { Page } from '../../core/browser.js';
import { waitForAnyAttached, waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { TIKTOK } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow the upload page to load after navigation
const SECONDARY_TIMEOUT_MS = 2_500; // page is already loaded; secondary checks are fast

/**
 * Navigating directly to the TikTok upload URL opens the upload surface.
 * We assert the file input (primary readiness signal) and the description editor are
 * reachable — presence only; no file is ever attached.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(TIKTOK.urls.upload, { waitUntil: 'domcontentloaded' });

  const checks: Array<{
    name: string;
    selector: string;
    timeoutMs: number;
    state: 'attached' | 'visible';
  }> = [
    {
      name: 'upload.uploadVideo',
      selector: `xpath=${TIKTOK.selectors.upload.uploadVideo}`,
      timeoutMs: PRIMARY_TIMEOUT_MS,
      state: 'attached',
    },
    {
      name: 'upload.description',
      selector: `xpath=${TIKTOK.selectors.upload.description}`,
      timeoutMs: SECONDARY_TIMEOUT_MS,
      state: 'visible',
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
