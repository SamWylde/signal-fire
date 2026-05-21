import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, jitterSleep } from '../../core/humanize.js';
import { humanClick } from '../../core/mouse.js';
import { FACEBOOK } from './selectors.js';

export interface FacebookLocalizedLabels {
  createPost: string;
  post: string;
  photoVideo: string;
  addPhotosVideos: string;
}

export interface FacebookComposeInput {
  // Full URL of the target Page or Profile composer context.
  // Caller owns choosing the Page/profile context they want to post to.
  pageUrl: string;
  text: string;
  // Image upload. Single image supported; multi-image not (FB modal varies; keep simple).
  imagePath?: string;
  localizedLabels?: Partial<FacebookLocalizedLabels>;
  /** Where to post. 'personal' uses the logged-in user. 'page' switches to the named page first. */
  postAs?: 'personal' | 'page';
  /** Required when postAs='page'. Exact display name of the Facebook page (e.g., "GrantCue"). */
  facebookPageName?: string;
  /** When true, skips the final publish click. */
  dryRun?: boolean;
  typingSpeedMultiplier?: number;
  wordPauseMaxMs?: number;
  onLog?: (message: string, detail?: string) => void;
}

function logFacebook(input: FacebookComposeInput, message: string, detail?: string): void {
  input.onLog?.(message, detail);
}

export function isManagementUrl(value: string): boolean {
  try {
    const url = new URL(value, 'https://www.facebook.com');
    const path = url.pathname.toLowerCase();
    return (
      (path === '/profile.php' && /^\d+$/.test(url.searchParams.get('id') ?? '')) ||
      /\/(admin|dashboard)(\/|$)/i.test(path)
    );
  } catch {
    return (
      /facebook\.com\/profile\.php\?[^#]*\bid=\d+/i.test(value) ||
      /facebook\.com\/.*\/(admin|dashboard)(\/|$)/i.test(value)
    );
  }
}

async function clickFirstVisible(
  page: Page,
  locators: Locator[],
  timeoutMs: number,
): Promise<boolean> {
  for (const locator of locators) {
    const candidate = locator.first();
    if (!(await isLocatorVisible(candidate, timeoutMs))) continue;
    await humanClick(page, candidate);
    return true;
  }
  return false;
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
    `Could not attach Facebook image file: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function facebookComposerTriggers(page: Page): Locator[] {
  return [
    page.locator(FACEBOOK.selectors.composer.inlinePlaceholder),
    page.getByRole('button', { name: /^(Create post|What's on your mind.*)$/i }),
    page.locator("div[role='button']:has-text('Create post')"),
    page.locator(FACEBOOK.selectors.composer.inlineRegion).getByRole('button').first(),
    page.locator(FACEBOOK.selectors.composer.inlinePhotoVideo),
  ];
}

async function hasManagementSurface(page: Page): Promise<boolean> {
  const locators = [
    page.getByText('Manage Page', { exact: true }),
    page.getByText('Professional dashboard', { exact: false }),
    page.getByRole('button', { name: /^Switch Now$/i }),
    page.locator("div[role='button']:has-text('Switch Now')"),
  ];
  for (const locator of locators) {
    if (await isLocatorVisible(locator.first(), 500).catch(() => false)) return true;
  }
  return false;
}

async function managementFailureHint(page: Page, input: FacebookComposeInput): Promise<string> {
  const managementUrl = isManagementUrl(input.pageUrl) || isManagementUrl(page.url());
  const managementSurface = await hasManagementSurface(page).catch(() => false);
  if (!managementUrl && !managementSurface) return '';
  return ' (management page detected - consider using the public page feed URL instead)';
}

async function switchIntoPageIfPromptVisible(
  page: Page,
  input: FacebookComposeInput,
): Promise<boolean> {
  const switched = await clickFirstVisible(
    page,
    [
      page.getByRole('button', { name: /^Switch Now$/i }),
      page.getByRole('button', { name: /^Switch$/i }),
      page.locator("div[role='button']:has-text('Switch Now')"),
      page.locator("div[role='button']:has-text('Switch')"),
    ],
    2500,
  ).catch(() => false);

  if (!switched) return false;
  logFacebook(input, 'Facebook page-management switch clicked');
  await page
    .waitForLoadState('networkidle', { timeout: FACEBOOK.timeouts.mediumMs })
    .catch(() => undefined);
  await jitterSleep(1500, 0.5);
  return true;
}

async function openFacebookComposer(page: Page, input: FacebookComposeInput): Promise<void> {
  const firstAttempt = await clickFirstVisible(
    page,
    facebookComposerTriggers(page),
    FACEBOOK.timeouts.shortMs,
  ).catch(() => false);
  if (firstAttempt) return;

  const switched = await switchIntoPageIfPromptVisible(page, input);
  if (switched) {
    const secondAttempt = await clickFirstVisible(
      page,
      facebookComposerTriggers(page),
      FACEBOOK.timeouts.mediumMs,
    ).catch(() => false);
    if (secondAttempt) return;
  }

  throw new Error(
    `Facebook no composer trigger found at ${page.url()}${await managementFailureHint(page, input)}`,
  );
}

// Drives the composer on an already-authenticated page. Throws on unrecoverable error.
export async function createPost(page: Page, input: FacebookComposeInput): Promise<void> {
  // --- Step 1: Navigate ---
  await page.goto(input.pageUrl, { waitUntil: 'domcontentloaded' });
  await jitterSleep(1500, 0.6);
  logFacebook(
    input,
    'Facebook page opened',
    `${page.url()}${isManagementUrl(input.pageUrl) || isManagementUrl(page.url()) ? ' (management URL)' : ''}`,
  );
  await switchIntoPageIfPromptVisible(page, input);

  // --- Step 2: Click a visible composer trigger to open the modal ---
  await openFacebookComposer(page, input);
  logFacebook(input, 'Facebook composer trigger clicked');

  // --- Step 3: Wait for Stage 1 composer modal ---
  await page
    .locator(FACEBOOK.selectors.composer.modal)
    .waitFor({ state: 'visible', timeout: FACEBOOK.timeouts.mediumMs });
  await jitterSleep(800, 0.5);

  // --- Step 4: Focus the Lexical text editor and type text ---
  const textEditor = page.locator(FACEBOOK.selectors.composer.textEditor).first();
  await humanType(textEditor, input.text, {
    naturalCadence: true,
    ...(input.typingSpeedMultiplier !== undefined && { typingSpeedMultiplier: input.typingSpeedMultiplier }),
    ...(input.wordPauseMaxMs !== undefined && { wordPauseMaxMs: input.wordPauseMaxMs }),
  });
  await jitterSleep(500, 0.5);

  // --- Step 5: Image upload (if provided) ---
  if (input.imagePath !== undefined) {
    const photoClicked = await clickFirstVisible(
      page,
      [
        page.locator(FACEBOOK.selectors.composer.modalPhotoVideo),
        page.locator(FACEBOOK.selectors.composer.photoVideoButtonAria),
      ],
      FACEBOOK.timeouts.shortMs,
    ).catch(() => false);

    if (!photoClicked) {
      throw new Error('Could not find Facebook photo/video button inside the composer modal');
    }

    // FB usually renders a hidden file input inside the dialog after clicking Photo/Video.
    await setFirstAttachedFileInput(
      [
        page.locator(`${FACEBOOK.selectors.composer.modalOuter} input[type='file']`),
        page.locator(`${FACEBOOK.selectors.composer.dialogForm} input[type='file']`),
        page.locator(`${FACEBOOK.selectors.composer.dialogRole} input[type='file']`),
      ],
      input.imagePath,
      FACEBOOK.timeouts.mediumMs,
    );

    // Wait for FB's preview render (inconsistent timing; flat sleep is simplest here).
    await jitterSleep(3000, 0.5);
  }

  // --- Step 6: Dry-run guard: stop before clicking Next if dryRun is true ---
  if (input.dryRun === true) {
    logFacebook(input, 'Facebook post ready for manual submit');
    console.log(
      '[facebook] dry-run: typed content but did not click Next or Post; modal stays open for inspection',
    );
    return;
  }

  // --- Step 7: Click Next to advance to Stage 2 (Post settings) ---
  const nextButton = page.locator(FACEBOOK.selectors.composer.nextButton).first();
  await nextButton.waitFor({ state: 'visible', timeout: FACEBOOK.timeouts.mediumMs });
  await humanClick(page, nextButton);

  // --- Step 8: Wait for Stage 2 settings dialog ---
  await page
    .locator(FACEBOOK.selectors.composer.settingsDialog)
    .waitFor({ state: 'visible', timeout: FACEBOOK.timeouts.mediumMs });
  await jitterSleep(600, 0.4);

  // --- Step 9: Click Post/Publish button (three-tier fallback) ---
  let postClickError: unknown = null;

  try {
    const clicked = await clickFirstVisible(
      page,
      [page.locator(FACEBOOK.selectors.composer.postSubmitButton)],
      FACEBOOK.timeouts.mediumMs,
    );
    if (!clicked) throw new Error('Could not find Facebook Post/Publish button in settings dialog');
    postClickError = null;
  } catch (err) {
    postClickError = err;
  }

  if (postClickError !== null) {
    // Tier 2: Ctrl+Enter (most FB composers accept this)
    try {
      await page.keyboard.press('Control+Enter');
      postClickError = null;
    } catch (err) {
      postClickError = err;
    }
  }

  if (postClickError !== null) {
    throw new Error(
      `Failed to click Post button: ${postClickError instanceof Error ? postClickError.message : String(postClickError)}`,
    );
  }

  // --- Step 10: Wait for submission confirmation ---
  try {
    await page
      .locator(FACEBOOK.selectors.composer.settingsDialog)
      .waitFor({ state: 'hidden', timeout: FACEBOOK.timeouts.longMs });
  } catch {
    throw new Error('Post may not have been published (settings dialog did not close)');
  }
}
