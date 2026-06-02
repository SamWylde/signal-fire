// Read-only composer probe for YouTube. Confirms the upload surface still resolves WITHOUT
// publishing anything: it navigates to YouTube Studio, opens the upload dialog via the
// Create button, and asserts the key selectors are reachable. It NEVER attaches a file,
// fills metadata, or clicks the publish/done button.

import type { Page } from '../../core/browser.js';
import { waitForAnyAttached, waitForAnyVisible } from '../../core/browser.js';
import type { ComposerProbe } from '../../core/connection-check.js';
import { YOUTUBE } from './selectors.js';

const PRIMARY_TIMEOUT_MS = 15_000; // allow Studio to load and the dialog to open
const SECONDARY_TIMEOUT_MS = 2_500; // dialog is open; secondary check is fast

/**
 * We navigate to YouTube Studio and open the upload dialog via the Create button + "Upload
 * videos" menu item — this is the open step only; no file is ever attached. We assert the
 * upload dialog (primary readiness signal) and the file input are reachable — the file input
 * is checked for reachability (attached) only, never used.
 */
export async function probeComposer(page: Page): Promise<ComposerProbe> {
  await page.goto(YOUTUBE.urls.upload, { waitUntil: 'domcontentloaded' });

  // Check if the upload dialog is already open (Studio sometimes auto-opens it).
  const dialogAlreadyOpen = await page
    .locator(YOUTUBE.selectors.upload.dialog)
    .first()
    .waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.shortMs })
    .then(() => true)
    .catch(() => false);

  if (!dialogAlreadyOpen) {
    // Click the Create button to open the upload menu.
    const createButton = page.locator(YOUTUBE.selectors.upload.createButton).first();
    await createButton
      .waitFor({ state: 'visible', timeout: PRIMARY_TIMEOUT_MS })
      .then(() => createButton.click())
      .catch(() => undefined);

    // Click "Upload videos" from the dropdown menu.
    const uploadVideos = page.locator(YOUTUBE.selectors.upload.uploadVideosMenuItem).first();
    await uploadVideos
      .waitFor({ state: 'visible', timeout: SECONDARY_TIMEOUT_MS })
      .then(() => uploadVideos.click())
      .catch(() => undefined);
  }

  const checks: Array<{
    name: string;
    selector: string;
    timeoutMs: number;
    state: 'attached' | 'visible';
  }> = [
    {
      name: 'upload.dialog',
      selector: YOUTUBE.selectors.upload.dialog,
      timeoutMs: PRIMARY_TIMEOUT_MS,
      state: 'visible',
    },
    {
      name: 'upload.fileInput',
      selector: YOUTUBE.selectors.upload.fileInput,
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
