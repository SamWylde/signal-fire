import type { Dialog } from 'patchright';

import { type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, selectAllShortcut, sleep } from '../../core/humanize.js';
import { humanClick } from '../../core/mouse.js';
import { TIKTOK } from './selectors.js';

// XPath prefix helper
const xp = (s: string) => `xpath=${s}`;

export type Visibility = 'everyone' | 'friends' | 'only_you';

export interface ScheduleInput {
  at: Date;
}

export interface UploadInput {
  videoPath: string;
  description: string;
  coverPath?: string;
  visibility?: Visibility;
  schedule?: ScheduleInput;
  productId?: string;
  allowComments?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  skipSplitWindow?: boolean;
  typingSpeedMultiplier?: number;
  wordPauseMaxMs?: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a Date for TikTok's schedule constraints:
 *   - At least 20 minutes in the future.
 *   - At most 10 days in the future.
 * Throws Error with a clear message on violation.
 */
export function validateSchedule(at: Date): void {
  const normalizedAt = normalizeSchedule(at);
  if (Number.isNaN(normalizedAt.getTime())) {
    throw new Error('Schedule must be a valid date.');
  }

  const now = Date.now();
  const msFromNow = normalizedAt.getTime() - now;

  if (msFromNow < 20 * 60 * 1000) {
    throw new Error('Schedule must be at least 20 minutes in the future.');
  }

  if (msFromNow > 10 * 24 * 60 * 60 * 1000) {
    throw new Error('Schedule must be at most 10 days in the future.');
  }
}

export function normalizeSchedule(at: Date): Date {
  const normalized = new Date(at);
  const minute = normalized.getMinutes();
  const remainder = minute % 5;
  if (remainder !== 0) {
    normalized.setMinutes(minute + (5 - remainder));
  }
  normalized.setSeconds(0, 0);
  return normalized;
}

export function getCalendarNavigationDirection(
  currentMonth: number,
  targetMonth: number,
): 'next' | 'previous' | null {
  if (currentMonth === targetMonth) return null;

  const forwardDistance = (targetMonth - currentMonth + 12) % 12;
  const backwardDistance = (currentMonth - targetMonth + 12) % 12;
  return forwardDistance <= backwardDistance ? 'next' : 'previous';
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function extensionOf(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  return dotIndex === -1 ? '' : filePath.slice(dotIndex + 1).toLowerCase();
}

export function isSupportedVideoPath(videoPath: string): boolean {
  const ext = extensionOf(videoPath);
  return TIKTOK.fileTypes.videoExtensions.some((supported) => supported === ext);
}

export function isSupportedCoverPath(coverPath: string): boolean {
  const ext = extensionOf(coverPath);
  return TIKTOK.fileTypes.coverExtensions.some((supported) => supported === ext);
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`;
}

async function goToUpload(page: Page): Promise<void> {
  if (page.url() !== TIKTOK.urls.upload) {
    await page.goto(TIKTOK.urls.upload);
  } else {
    const acceptDialog = (dialog: Dialog) => void dialog.accept();
    page.on('dialog', acceptDialog);
    try {
      await page.reload();
    } finally {
      page.off('dialog', acceptDialog);
    }
  }
  await page.waitForSelector('#root', { timeout: TIKTOK.timeouts.explicitWaitMs });
}

async function removeCookiesWindow(page: Page): Promise<void> {
  try {
    const banner = TIKTOK.selectors.cookiesBanner.banner;
    const btn = TIKTOK.selectors.cookiesBanner.button;
    const button = page.locator(`${banner} >> ${btn} >> button`).first();
    const visible = await isLocatorVisible(button, 5000);
    if (visible) await humanClick(page, button);
  } catch {
    // best-effort — silently continue
  }
}

async function setVideo(page: Page, videoPath: string): Promise<void> {
  if (!isSupportedVideoPath(videoPath)) {
    throw new Error(`Unsupported TikTok video file extension: ${videoPath}`);
  }

  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await page.locator(xp(TIKTOK.selectors.upload.uploadVideo)).setInputFiles(videoPath);
      await page
        .locator(xp(TIKTOK.selectors.upload.processConfirmation))
        .waitFor({ state: 'attached', timeout: TIKTOK.timeouts.explicitWaitMs });
      return;
    } catch (err) {
      if (
        err instanceof Error &&
        err.constructor.name === 'TimeoutError' &&
        attempt < maxRetries - 1
      ) {
        continue;
      }
      throw err;
    }
  }
}

async function setCover(page: Page, coverPath: string): Promise<void> {
  try {
    if (!isSupportedCoverPath(coverPath)) {
      throw new Error(`Unsupported TikTok cover file extension: ${coverPath}`);
    }

    const previewLoc = page.locator(xp(TIKTOK.selectors.cover.coverPreview));
    const currentSrc = await previewLoc.getAttribute('src');

    await humanClick(page, page.locator(xp(TIKTOK.selectors.cover.editCoverButton)));
    await humanClick(page, page.locator(xp(TIKTOK.selectors.cover.uploadCoverTab)));
    await page.locator(xp(TIKTOK.selectors.cover.uploadCover)).setInputFiles(coverPath);
    await humanClick(page, page.locator(xp(TIKTOK.selectors.cover.uploadConfirmation)));

    // Wait for the cover src to change (up to 10s)
    for (let i = 0; i < 20; i++) {
      const newSrc = await previewLoc.getAttribute('src');
      if (newSrc !== currentSrc) break;
      await sleep(500);
    }
  } catch (err) {
    // On error, try to close the cover editor if open
    try {
      const exit = page.locator(xp(TIKTOK.selectors.cover.exitCoverContainer));
      if (await exit.isVisible()) await humanClick(page, exit);
    } catch {
      // ignore
    }
    throw new Error(
      `Failed to set TikTok cover: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function removeSplitWindow(page: Page): Promise<void> {
  try {
    const window = page.locator(xp(TIKTOK.selectors.upload.splitWindow));
    const visible = await isLocatorVisible(window, TIKTOK.timeouts.implicitWaitMs);
    if (visible) await humanClick(page, window);
  } catch {
    // best-effort — silently continue
  }
}

interface InteractivityOptions {
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

async function setInteractivity(
  page: Page,
  opts: InteractivityOptions,
  required: boolean,
): Promise<void> {
  try {
    const commentBox = page.locator(xp(TIKTOK.selectors.upload.comment));
    const duetBox = page.locator(xp(TIKTOK.selectors.upload.duet));
    const stitchBox = page.locator(xp(TIKTOK.selectors.upload.stitch));

    const commentChecked = await commentBox.isChecked();
    const duetChecked = await duetBox.isChecked();
    const stitchChecked = await stitchBox.isChecked();

    if (opts.allowComments !== commentChecked) await humanClick(page, commentBox);
    if (opts.allowDuet !== duetChecked) await humanClick(page, duetBox);
    if (opts.allowStitch !== stitchChecked) await humanClick(page, stitchBox);
  } catch (err) {
    if (required) {
      throw new Error(
        `Failed to set TikTok interactivity settings: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // Defaults are best-effort because TikTok sometimes hides these controls.
  }
}

async function setDescription(
  page: Page,
  rawDescription: string,
  typingSpeedMultiplier?: number,
  wordPauseMaxMs?: number,
): Promise<void> {
  const description = rawDescription.slice(0, TIKTOK.limits.maxDescriptionLength);
  const humanTypeOpts = {
    naturalCadence: true as const,
    ...(typingSpeedMultiplier !== undefined && { typingSpeedMultiplier }),
    ...(wordPauseMaxMs !== undefined && { wordPauseMaxMs }),
  };

  const descLoc = page.locator(xp(TIKTOK.selectors.upload.description));
  await descLoc.waitFor({ state: 'visible', timeout: TIKTOK.timeouts.implicitWaitMs });
  await humanClick(page, descLoc);
  await descLoc.press(selectAllShortcut());
  await descLoc.press('Backspace');
  await humanClick(page, descLoc);
  await sleep(1000);

  const words = description.split(' ');
  for (const word of words) {
    if (word.length === 0) {
      await descLoc.press(' ');
      continue;
    }

    if (word[0] === '#') {
      await humanType(descLoc, word, humanTypeOpts);
      await sleep(500);
      const mentionBox = page.locator(xp(TIKTOK.selectors.upload.mentionBox));
      try {
        await mentionBox.waitFor({ state: 'visible', timeout: TIKTOK.timeouts.addHashtagWaitMs });
        await descLoc.press('Enter');
      } catch {
        // no popup — continue
      }
    } else if (word[0] === '@') {
      await humanType(descLoc, word, humanTypeOpts);
      await sleep(1000);
      const mentionBoxUserId = page.locator(xp(TIKTOK.selectors.upload.mentionBoxUserId));
      try {
        await mentionBoxUserId.first().waitFor({ state: 'visible', timeout: 5000 });
        const userEls = await mentionBoxUserId.all();
        const targetUsername = word.slice(1).toLowerCase();
        let found = false;
        for (let i = 0; i < userEls.length; i++) {
          const el = userEls[i];
          if (el === undefined) continue;
          if (await el.isVisible()) {
            const text = (await el.innerText()).split(' ')[0] ?? '';
            if (text.toLowerCase() === targetUsername) {
              found = true;
              for (let j = 0; j < i; j++) await descLoc.press('ArrowDown');
              await descLoc.press('Enter');
              break;
            }
          }
        }
        if (!found) await humanType(descLoc, ' ', humanTypeOpts);
      } catch {
        await humanType(descLoc, ' ', humanTypeOpts);
      }
    } else {
      await humanType(descLoc, `${word} `, humanTypeOpts);
    }
  }
}

const VISIBILITY_TEXT_MAP: Record<Visibility, string> = {
  everyone: 'Everyone',
  friends: 'Friends',
  only_you: 'Only you',
};

async function setVisibility(page: Page, visibility: Visibility): Promise<void> {
  try {
    const dropdown = page.locator(
      `xpath=//div[@data-e2e='video_visibility_container']//button[@role='combobox']`,
    );
    await humanClick(page, dropdown);
    await sleep(1500);

    const optionText = VISIBILITY_TEXT_MAP[visibility];
    const option = page.locator(
      `xpath=//div[@role='option' and contains(., ${xpathLiteral(optionText)})]`,
    );
    await option.scrollIntoViewIfNeeded();
    await sleep(500);
    await humanClick(page, option);
  } catch (err) {
    throw new Error(
      `Failed to set TikTok visibility to ${visibility}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function setScheduleVideo(page: Page, at: Date): Promise<void> {
  // Convert to browser's local timezone by asking the page
  const tzString = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Format the date in the browser's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tzString,
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(at);
  const get = (type: string) => {
    const part = parts.find((p) => p.type === type);
    return part !== undefined ? Number.parseInt(part.value, 10) : 0;
  };

  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');

  const switchEl = page.locator(xp(TIKTOK.selectors.schedule.switch));
  await humanClick(page, switchEl);

  await datePicker(page, month, day);
  await timePicker(page, hour, minute);
}

async function datePicker(page: Page, month: number, day: number): Promise<void> {
  const datePickerEl = page.locator(xp(TIKTOK.selectors.schedule.datePicker));
  await humanClick(page, datePickerEl);

  const calendar = page.locator(xp(TIKTOK.selectors.schedule.calendar));
  await calendar.waitFor({ state: 'visible' });

  const calendarMonthText = await page
    .locator(xp(TIKTOK.selectors.schedule.calendarMonth))
    .innerText();
  const parsedMonth = new Date(`${calendarMonthText} 1, 2000`).getMonth() + 1;

  const navigationDirection = getCalendarNavigationDirection(parsedMonth, month);
  if (navigationDirection !== null) {
    const arrows = page.locator(xp(TIKTOK.selectors.schedule.calendarArrows));
    if (navigationDirection === 'next') {
      await humanClick(page, arrows.last());
    } else {
      await humanClick(page, arrows.first());
    }
  }

  const validDays = await page.locator(xp(TIKTOK.selectors.schedule.calendarValidDays)).all();

  let dayToClick = null;
  for (const dayOption of validDays) {
    const text = await dayOption.innerText();
    if (Number.parseInt(text, 10) === day) {
      dayToClick = dayOption;
      break;
    }
  }

  if (dayToClick === null) throw new Error(`Day ${day} not found in calendar`);
  await humanClick(page, dayToClick);

  // Verify
  const dateSelected = await datePickerEl.innerText();
  const parts = dateSelected.split('-');
  const selectedMonth = Number.parseInt(parts[1] ?? '0', 10);
  const selectedDay = Number.parseInt(parts[2] ?? '0', 10);
  if (selectedMonth !== month || selectedDay !== day) {
    throw new Error(
      `Date picker verification failed: expected ${month}-${day} but got ${selectedMonth}-${selectedDay}`,
    );
  }
}

async function timePicker(page: Page, hour: number, minute: number): Promise<void> {
  const timePickerEl = page.locator(xp(TIKTOK.selectors.schedule.timePicker));
  await humanClick(page, timePickerEl);

  const container = page.locator(xp(TIKTOK.selectors.schedule.timePickerContainer));
  await container.waitFor({ state: 'visible' });

  const hourOptions = page.locator(xp(TIKTOK.selectors.schedule.timepickerHours));
  const minuteOptions = page.locator(xp(TIKTOK.selectors.schedule.timepickerMinutes));

  const hourToClick = hourOptions.nth(hour);
  const minuteToClick = minuteOptions.nth(Math.floor(minute / 5));

  await hourToClick.scrollIntoViewIfNeeded();
  await sleep(500);
  await humanClick(page, hourToClick);

  await minuteToClick.scrollIntoViewIfNeeded();
  await sleep(500);
  await humanClick(page, minuteToClick);

  // Close picker
  await humanClick(page, timePickerEl);
  await sleep(500);

  // Verify
  const timeSelected = await page.locator(xp(TIKTOK.selectors.schedule.timePickerText)).innerText();
  const timeParts = timeSelected.split(':');
  const selectedHour = Number.parseInt(timeParts[0] ?? '0', 10);
  const selectedMinute = Number.parseInt(timeParts[1] ?? '0', 10);
  if (selectedHour !== hour || selectedMinute !== minute) {
    throw new Error(
      `Time picker verification failed: expected ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} but got ${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`,
    );
  }
}

async function addProductLink(page: Page, productId: string): Promise<void> {
  try {
    await humanClick(
      page,
      page.locator(xp("//button[contains(@class, 'Button__root') and contains(., 'Add')]")).first(),
    );
    await sleep(1000);

    const firstNext = page
      .locator(xp("//button[contains(@class, 'TUXButton--primary') and .//div[text()='Next']]"))
      .first();
    if (await isLocatorVisible(firstNext, 3000)) {
      await humanClick(page, firstNext);
      await sleep(1000);
    }

    const productLiteral = xpathLiteral(productId);
    const searchInput = page.locator(xp("//input[@placeholder='Search products']")).first();
    await searchInput.fill(productId);
    await searchInput.press('Enter');
    await sleep(3000);

    await humanClick(
      page,
      page
        .locator(
          xp(
            `//tr[.//span[contains(normalize-space(.), ${productLiteral})] or .//div[contains(normalize-space(.), ${productLiteral})]]//input[@type='radio' and contains(@class, 'TUXRadioStandalone-input')]`,
          ),
        )
        .first(),
    );
    await sleep(1000);

    await humanClick(
      page,
      page
        .locator(xp("//button[contains(@class, 'TUXButton--primary') and .//div[text()='Next']]"))
        .first(),
    );
    await sleep(1000);

    const finalAdd = page
      .locator(xp("//button[contains(@class, 'TUXButton--primary') and .//div[text()='Add']]"))
      .first();
    await humanClick(page, finalAdd);
    await finalAdd.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  } catch (err) {
    throw new Error(
      `Failed to add TikTok product link ${productId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function postVideo(page: Page): Promise<void> {
  const postXpath = TIKTOK.selectors.upload.post;

  await page.waitForFunction(
    (xpath: string) => {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      const el = result.singleNodeValue as HTMLElement | null;
      return el !== null ? el.getAttribute('data-disabled') === 'false' : false;
    },
    postXpath,
    { timeout: TIKTOK.timeouts.uploadingWaitMs },
  );

  const postBtn = page.locator(xp(TIKTOK.selectors.upload.post));
  await postBtn.scrollIntoViewIfNeeded();
  await humanClick(page, postBtn);

  // Handle optional "Post now" confirmation dialog
  try {
    const postNow = page.locator(xp(TIKTOK.selectors.upload.postNow));
    const visible = await isLocatorVisible(postNow, 5000);
    if (visible) await humanClick(page, postNow);
  } catch {
    // no dialog — continue
  }

  await page
    .locator(xp(TIKTOK.selectors.upload.postConfirmation))
    .waitFor({ state: 'attached', timeout: TIKTOK.timeouts.explicitWaitMs });
}

// ---------------------------------------------------------------------------
// Public orchestration
// ---------------------------------------------------------------------------

/**
 * Drives the full TikTok upload flow on an already-authenticated page.
 * Mirrors Python `complete_upload_form`.
 */
export async function completeUploadForm(page: Page, input: UploadInput): Promise<void> {
  const {
    videoPath,
    description,
    coverPath,
    visibility = 'everyone',
    schedule,
    productId,
    allowComments = true,
    allowDuet = true,
    allowStitch = true,
    skipSplitWindow = false,
    typingSpeedMultiplier,
    wordPauseMaxMs,
  } = input;

  await goToUpload(page);
  await removeCookiesWindow(page);
  await setVideo(page, videoPath);
  if (coverPath !== undefined) await setCover(page, coverPath);
  if (!skipSplitWindow) await removeSplitWindow(page);
  const interactivityRequired =
    input.allowComments !== undefined ||
    input.allowDuet !== undefined ||
    input.allowStitch !== undefined;
  await setInteractivity(page, { allowComments, allowDuet, allowStitch }, interactivityRequired);
  await setDescription(page, description, typingSpeedMultiplier, wordPauseMaxMs);
  if (visibility !== 'everyone') await setVisibility(page, visibility);
  if (schedule !== undefined) {
    const normalizedAt = normalizeSchedule(schedule.at);
    validateSchedule(normalizedAt);
    await setScheduleVideo(page, normalizedAt);
  }
  if (productId !== undefined) await addProductLink(page, productId);
  await postVideo(page);
}
