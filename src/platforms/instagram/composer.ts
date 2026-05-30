import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { buildTypingOptions, checkBlocked, humanType, jitterSleep } from '../../core/humanize.js';
import { clickFirstVisible } from '../../core/locators.js';
import { humanClick } from '../../core/mouse.js';
import { INSTAGRAM } from './selectors.js';

export interface InstagramComposeInput {
  imagePath: string; // single image path (jpg/png/webp)
  caption?: string; // clamped to INSTAGRAM.limits.maxCaptionLength internally
  typingSpeedMultiplier?: number;
  wordPauseMaxMs?: number;
  /** When true, executes all steps but skips the final Share click. */
  dryRun?: boolean;
  onLog?: (message: string, detail?: string) => void;
}

export interface InstagramComposeResult {
  status: 'posted';
  detail: string;
}

function logInstagram(input: InstagramComposeInput, message: string, detail?: string): void {
  input.onLog?.(message, detail);
}

export function hasInstagramShareConfirmationText(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return (
    normalized.includes(INSTAGRAM.selectors.composer.shareConfirmationHeading) ||
    normalized.includes(INSTAGRAM.selectors.composer.shareConfirmationText)
  );
}

async function setFirstAttachedFileInput(
  locators: Locator[],
  filePath: string,
  timeoutMs: number,
): Promise<void> {
  let lastError: unknown = null;
  for (const locator of locators) {
    try {
      const input = locator.first();
      await input.waitFor({ state: 'attached', timeout: timeoutMs });
      await input.setInputFiles(filePath);
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `Could not attach Instagram image file: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function actionButtonLocators(page: Page, label: 'Next' | 'Share'): Locator[] {
  return [
    page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
    page.locator(
      `xpath=//*[self::button or self::a or @role='button'][normalize-space()='${label}' or .//*[normalize-space()='${label}']]`,
    ),
    page.locator(`[role='button']:has-text("${label}")`),
    page.locator(`div[role='button']:has-text("${label}")`),
    page.locator(
      label === 'Next'
        ? INSTAGRAM.selectors.composer.nextButton
        : INSTAGRAM.selectors.composer.shareButton,
    ),
  ];
}

function postMenuLocators(page: Page): Locator[] {
  return [
    page.getByRole('menuitem', { name: /^Post$/i }),
    page.getByRole('link', { name: /^Post$/i }),
    page.getByRole('button', { name: /^Post$/i }),
    page.locator(INSTAGRAM.selectors.composer.postMenuItem),
    page.locator(INSTAGRAM.selectors.composer.postTypePost),
  ];
}

async function clickPostMenuIfPresent(page: Page, input: InstagramComposeInput): Promise<void> {
  const clicked = await clickFirstVisible(page, postMenuLocators(page), 2000, {
    tryAncestor: true,
  }).catch(() => false);
  if (clicked) {
    logInstagram(input, 'Instagram Post menu item selected');
    await jitterSleep(800, 0.4);
  }
}

async function waitForInstagramShareConfirmation(
  page: Page,
  input: InstagramComposeInput,
): Promise<InstagramComposeResult> {
  const confirmation = await page
    .waitForFunction(
      ({ headingText, bodyText }) => {
        const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
        const headings = Array.from(document.querySelectorAll('[role="heading"], h1, h2, h3')).map(
          (node) => normalize(node.textContent ?? ''),
        );
        const body = normalize(document.body.textContent ?? '');
        const hasHeading = headings.includes(headingText);
        const hasBody = body.includes(bodyText);
        if (!hasHeading && !hasBody) return false;

        const signals = [
          hasHeading ? 'Post shared heading' : undefined,
          hasBody ? 'Your post has been shared body text' : undefined,
        ].filter((signal): signal is string => signal !== undefined);

        return {
          signal: signals.join(' + '),
          pageUrl: window.location.href,
        };
      },
      {
        headingText: INSTAGRAM.selectors.composer.shareConfirmationHeading,
        bodyText: INSTAGRAM.selectors.composer.shareConfirmationText,
      },
      { timeout: INSTAGRAM.timeouts.longMs },
    )
    .then((handle) => handle.jsonValue() as Promise<{ signal: string; pageUrl: string }>);

  const detail = `Confirmed by Instagram ${confirmation.signal} at ${confirmation.pageUrl}`;
  logInstagram(input, 'Instagram share confirmation detected', detail);
  return { status: 'posted', detail };
}

async function visibleScreenSummary(page: Page): Promise<string> {
  const headings = await page
    .locator('[role="heading"], h1, h2, h3')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, 5),
    )
    .catch(() => []);
  return `url=${page.url()}; headings=${headings.length > 0 ? headings.join(' | ') : 'none'}`;
}

async function clickNextWithRetry(
  page: Page,
  input: InstagramComposeInput,
  screenName: string,
): Promise<void> {
  logInstagram(input, `Looking for ${screenName} Next button`);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const clicked = await clickFirstVisible(page, actionButtonLocators(page, 'Next'), 2500, {
      tryAncestor: true,
    }).catch((err) => {
      lastError = err;
      return false;
    });
    if (clicked) {
      logInstagram(input, `${screenName} Next button clicked`, `attempt ${attempt}`);
      await page.waitForTimeout(800);
      return;
    }
    await page.waitForTimeout(1000);
  }

  throw new Error(
    `Could not click Instagram ${screenName} Next button after 3 attempts (${await visibleScreenSummary(page)}): ${
      lastError instanceof Error ? lastError.message : String(lastError ?? 'button not found')
    }`,
  );
}

// Drives the new-post wizard on an authenticated page. Throws on unrecoverable error or
// if Instagram surfaces an Action Blocked screen.
export async function createPost(
  page: Page,
  input: InstagramComposeInput,
): Promise<InstagramComposeResult | undefined> {
  const { shortMs, mediumMs, longMs } = INSTAGRAM.timeouts;

  // --- Step 1: Navigate ---
  await page.goto(INSTAGRAM.urls.home, { waitUntil: 'domcontentloaded' });
  await jitterSleep(1500, 0.6);

  // --- Step 2: Block check pre-flight ---
  // Callers should treat a blocked signal as a cue to back off (e.g. via the rate limiter).
  const preCheck = await checkBlocked(page, { extraPhrases: [...INSTAGRAM.blockPhrases] });
  if (preCheck.blocked) {
    throw new Error(`Instagram blocked: ${preCheck.reason}`);
  }

  // --- Step 3: Click "New post" trigger ---
  // Primary: verified a[aria-label="New post"] from sidebar nav HTML (2026-05-20)
  const triggerClicked = await clickFirstVisible(
    page,
    [
      page.locator(INSTAGRAM.selectors.composer.newPostTrigger),
      page.getByRole('link', { name: /^(Create|New post)$/i }),
      page.getByRole('button', { name: /^(Create|New post)$/i }),
      page.locator("a[href*='/create']"),
    ],
    shortMs,
    { tryAncestor: true },
  );

  if (!triggerClicked) {
    throw new Error('Could not find New post trigger - selectors may be stale');
  }
  logInstagram(input, 'Instagram create trigger clicked');

  // --- Step 4: Choose Post from the intermediate Create menu if Instagram shows it ---
  await clickPostMenuIfPresent(page, input);

  // --- Step 5: Wait for dialog modal ---
  // Primary: verified createModal selector (2026-05-20); fallback to generic dialog
  await page
    .locator(INSTAGRAM.selectors.composer.createModal)
    .or(page.locator(INSTAGRAM.selectors.composer.dialog))
    .first()
    .waitFor({ state: 'visible', timeout: mediumMs });
  logInstagram(input, 'Instagram create dialog opened');
  await jitterSleep(800, 0.4);

  // --- Step 6: Detect Reel-vs-Post selection (if Instagram shows the choice) ---
  // Some IG versions show this toggle; newer flows skip directly to the file picker.
  try {
    const postTypeLocator = page.locator(INSTAGRAM.selectors.composer.postTypePost).first();
    const postTypeVisible = await isLocatorVisible(postTypeLocator, shortMs);
    if (postTypeVisible) {
      await humanClick(page, postTypeLocator);
      logInstagram(input, 'Instagram Post type selected');
    }
  } catch {
    // Toggle not present — continue
  }

  // --- Step 7: Upload file ---
  // Primary: verified Stage 1 file input scoped to the Create new post modal (2026-05-20)
  await setFirstAttachedFileInput(
    [
      page.locator(INSTAGRAM.selectors.composer.fileInput),
      page.locator(INSTAGRAM.selectors.composer.createModal).locator("input[type='file']"),
      page.locator(INSTAGRAM.selectors.composer.dialog).first().locator("input[type='file']"),
      page.locator("input[type='file'][accept*='image']"),
      page.locator("input[type='file']"),
    ],
    input.imagePath,
    mediumMs,
  );
  logInstagram(input, 'Instagram image file attached');
  await jitterSleep(2500, 0.5);

  // --- Step 9: Advance through Crop / Filter / Adjust screens ---
  // Wait for the Crop screen to appear after upload.
  await page
    .locator(INSTAGRAM.selectors.composer.cropScreenHeading)
    .waitFor({ state: 'visible', timeout: 15_000 });
  logInstagram(input, 'Instagram Crop screen detected');

  // Click Next until the Share button appears (caption screen) or we hit the max.
  // Max 2: once from Crop to Edit, once from Edit to Caption.
  const MAX_NEXT_CLICKS = 2;
  for (let i = 0; i < MAX_NEXT_CLICKS; i++) {
    const shareLocator = page.locator(INSTAGRAM.selectors.composer.shareButton);
    if ((await shareLocator.count()) > 0 && (await shareLocator.first().isVisible())) {
      // Reached the caption screen — stop clicking Next.
      break;
    }
    await clickNextWithRetry(page, input, i === 0 ? 'Crop' : 'Edit');
  }

  // --- Step 10: Fill caption ---
  // Wait for the Share button to confirm we've reached the Caption screen.
  await page
    .locator(INSTAGRAM.selectors.composer.shareButton)
    .waitFor({ state: 'visible', timeout: mediumMs })
    .catch(async (err) => {
      throw new Error(
        `Could not reach Instagram caption screen after advancing upload flow (${await visibleScreenSummary(page)}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

  if (input.caption !== undefined) {
    let captionText = input.caption;
    if (captionText.length > INSTAGRAM.limits.maxCaptionLength) {
      process.stderr.write(
        `[instagram] caption truncated from ${captionText.length} to ${INSTAGRAM.limits.maxCaptionLength} characters\n`,
      );
      captionText = captionText.slice(0, INSTAGRAM.limits.maxCaptionLength);
    }
    // Caption is a Lexical contenteditable div — click to focus, then type.
    const captionLocator = page.locator(INSTAGRAM.selectors.composer.captionEditor).first();
    await humanClick(page, captionLocator);
    logInstagram(input, 'Typing Instagram caption');
    await humanType(captionLocator, captionText, buildTypingOptions(input));
  }

  // --- Step 11: Click Share (three-tier fallback) ---
  if (input.dryRun === true) {
    logInstagram(input, 'Instagram post ready for manual submit');
    console.log('[instagram] dry-run: typed caption but did not click Share');
    return;
  }

  let shareError: unknown = null;

  try {
    const clicked = await clickFirstVisible(page, actionButtonLocators(page, 'Share'), mediumMs, {
      tryAncestor: true,
    });
    if (!clicked) throw new Error('Could not find Instagram Share button');
    shareError = null;
  } catch (err) {
    shareError = err;
  }

  if (shareError !== null) {
    // Tier 2: mouse click on the explicit Share fallback.
    try {
      const fallback = actionButtonLocators(page, 'Share')[0]?.first();
      if (fallback === undefined) throw new Error('No Instagram Share fallback locator');
      await humanClick(page, fallback);
      shareError = null;
    } catch (err) {
      shareError = err;
    }
  }

  if (shareError !== null) {
    // Tier 3: focus caption area and Ctrl+Enter
    try {
      await humanClick(page, page.locator(INSTAGRAM.selectors.composer.captionEditor).first());
      await page.keyboard.press('Control+Enter');
      shareError = null;
    } catch (err) {
      shareError = err;
    }
  }

  if (shareError !== null) {
    throw new Error(
      `Failed to click Share button via all three methods: ${shareError instanceof Error ? shareError.message : String(shareError)}`,
    );
  }

  // --- Step 12: Confirmation ---
  // Dialog close alone is not enough: blocked/error layouts can also dismiss the composer.
  let result: InstagramComposeResult;
  try {
    result = await waitForInstagramShareConfirmation(page, input);
  } catch {
    const blockCheck = await checkBlocked(page, {
      extraPhrases: [...INSTAGRAM.blockPhrases],
      perCheckTimeoutMs: 1000,
    });
    if (blockCheck.blocked) {
      throw new Error(`Instagram blocked: ${blockCheck.reason}`);
    }
    throw new Error('Post may not have been published (no share confirmation appeared)');
  }

  const doneClicked = await clickFirstVisible(
    page,
    [
      page.getByRole('button', { name: /^Done$/i }),
      page.locator(INSTAGRAM.selectors.composer.doneButton),
    ],
    shortMs,
    { tryAncestor: true },
  ).catch(() => false);
  if (doneClicked) {
    logInstagram(input, 'Instagram success dialog closed');
    await page
      .locator(INSTAGRAM.selectors.composer.dialog)
      .waitFor({ state: 'hidden', timeout: mediumMs })
      .catch(() => undefined);
  }

  // --- Step 13: Post-publish block check ---
  // IG sometimes silently rejects posts after submission — surface this as a thrown error.
  const postCheck = await checkBlocked(page, { extraPhrases: [...INSTAGRAM.blockPhrases] });
  if (postCheck.blocked) {
    throw new Error(`Instagram blocked: ${postCheck.reason}`);
  }

  return result;
}
