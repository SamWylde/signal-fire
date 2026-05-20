import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, jitterSleep, selectAllShortcut } from '../../core/humanize.js';
import { humanClick } from '../../core/mouse.js';
import { YOUTUBE } from './selectors.js';

export type Visibility = 'public' | 'unlisted' | 'private';

export interface YouTubeScheduleInput {
  at: Date;
}

export interface YouTubeUploadInput {
  videoPath: string;
  thumbnailPath?: string;
  title: string;
  description?: string;
  tags?: string[];
  playlist?: string;
  madeForKids?: boolean;
  visibility?: Visibility;
  schedule?: YouTubeScheduleInput;
}

export interface YouTubeUploadResult {
  videoUrl?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateSchedule(at: Date): void {
  if (Number.isNaN(at.getTime())) {
    throw new Error('Schedule must be a valid date.');
  }

  const msFromNow = at.getTime() - Date.now();

  if (msFromNow < 15 * 60 * 1000) {
    throw new Error('Schedule must be at least 15 minutes in the future.');
  }

  if (msFromNow > 183 * 24 * 60 * 60 * 1000) {
    throw new Error('Schedule must be at most 6 months (183 days) in the future.');
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function setVideo(page: Page, videoPath: string): Promise<void> {
  await page.locator(YOUTUBE.selectors.upload.fileInput).first().setInputFiles(videoPath);
  await page
    .locator(YOUTUBE.selectors.metadata.textbox)
    .first()
    .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.mediumMs });
}

async function openUploadFlow(page: Page): Promise<void> {
  await page.goto(YOUTUBE.urls.upload, { waitUntil: 'domcontentloaded' });

  const uploadDialog = page.locator(YOUTUBE.selectors.upload.dialog).first();
  const dialogAlreadyOpen = await uploadDialog
    .waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.shortMs })
    .then(() => true)
    .catch(() => false);

  if (!dialogAlreadyOpen) {
    await Promise.race([
      page
        .locator(YOUTUBE.selectors.loginIndicators.ytStudioAvatar)
        .first()
        .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.longMs }),
      page
        .locator(YOUTUBE.selectors.loginIndicators.channelSideRail)
        .first()
        .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.longMs }),
    ]).catch(() => {
      // Auth is checked by the caller; still try the upload controls if Studio is slow.
    });

    const createButton = page.locator(YOUTUBE.selectors.upload.createButton).first();
    await createButton.waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.mediumMs });
    await humanClick(page, createButton);

    const uploadVideos = page.locator(YOUTUBE.selectors.upload.uploadVideosMenuItem).first();
    await uploadVideos.waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.mediumMs });
    await humanClick(page, uploadVideos);
    await uploadDialog.waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.longMs });
  }

  await page
    .locator(YOUTUBE.selectors.upload.fileInput)
    .first()
    .waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.longMs });
}

async function fillMetadata(
  page: Page,
  title: string,
  description: string | undefined,
): Promise<void> {
  const clampedTitle = title.slice(0, YOUTUBE.limits.maxTitleLength);
  const titleBox = await metadataTextBox(page, YOUTUBE.selectors.metadata.titleAria, 0, 'title');
  await humanClick(page, titleBox);
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.press('Delete');
  await humanType(titleBox, clampedTitle);

  if (description !== undefined) {
    const clampedDesc = description.slice(0, YOUTUBE.limits.maxDescriptionLength);
    const descBox = await metadataTextBox(
      page,
      YOUTUBE.selectors.metadata.descriptionAria,
      1,
      'description',
    );
    await humanClick(page, descBox);
    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.press('Delete');
    await humanType(descBox, clampedDesc);
  }
}

async function metadataTextBox(
  page: Page,
  ariaSelector: string,
  fallbackIndex: number,
  label: string,
): Promise<Locator> {
  const byAria = page.locator(ariaSelector).first();
  if (await isLocatorVisible(byAria, 3000)) {
    const nestedTextBox = byAria.locator(YOUTUBE.selectors.metadata.textbox).first();
    if (await isLocatorVisible(nestedTextBox, 1000)) return nestedTextBox;
    return byAria;
  }

  const fallback = page.locator(YOUTUBE.selectors.metadata.textbox).nth(fallbackIndex);
  await fallback.waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.mediumMs }).catch(() => {
    throw new Error(`Could not find YouTube ${label} metadata field`);
  });
  return fallback;
}

async function fillTags(page: Page, tags: string[]): Promise<void> {
  await humanClick(page, page.locator(YOUTUBE.selectors.metadata.showMore).first());

  let tagsInput = page.locator(YOUTUBE.selectors.metadata.tagsInputAria).first();
  const ariaVisible = await isLocatorVisible(tagsInput, 3000);
  if (!ariaVisible) {
    tagsInput = page.locator(YOUTUBE.selectors.metadata.tagsInput).first();
  }
  await tagsInput.waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.shortMs });

  const tagsString = tags.join(',').slice(0, YOUTUBE.limits.maxTags);
  await humanClick(page, tagsInput);
  await page.keyboard.type(tagsString);
}

async function setThumbnail(page: Page, thumbnailPath: string): Promise<void> {
  const thumbnailInput = page.locator(YOUTUBE.selectors.upload.thumbnailFileInput).first();
  await thumbnailInput.waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.mediumMs });
  await thumbnailInput.setInputFiles(thumbnailPath);
}

async function setAudience(page: Page, madeForKids: boolean): Promise<void> {
  if (!madeForKids) {
    const audienceHost = page.locator(YOUTUBE.selectors.audience.notMadeForKids).first();
    await humanClick(page, audienceHost.locator(YOUTUBE.selectors.audience.radioLabel));
  } else {
    const audienceHost = page.locator("[name='VIDEO_MADE_FOR_KIDS_MFK']").first();
    await humanClick(page, audienceHost.locator(YOUTUBE.selectors.audience.radioLabel));
  }
}

async function addToPlaylist(page: Page, playlist: string): Promise<void> {
  await humanClick(page, page.locator(YOUTUBE.selectors.playlist.dropdown).first());
  await page
    .locator(YOUTUBE.selectors.playlist.searchInput)
    .first()
    .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.shortMs });
  await page.locator(YOUTUBE.selectors.playlist.searchInput).first().fill(playlist);

  const items = page.locator(YOUTUBE.selectors.playlist.itemsContainer).first();
  const existing = items.getByText(playlist, { exact: true }).first();
  const found = await isLocatorVisible(existing, YOUTUBE.timeouts.shortMs);

  if (found) {
    await humanClick(page, existing);
  } else {
    await page.locator(YOUTUBE.selectors.playlist.searchInput).first().fill('');
    await humanClick(page, page.locator(YOUTUBE.selectors.playlist.newButton).first());
    await page
      .locator(YOUTUBE.selectors.playlist.createContainer)
      .first()
      .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.shortMs });
    const titleBox = page.locator(YOUTUBE.selectors.playlist.createTitleTextarea).first();
    await titleBox.fill(playlist);
    await humanClick(page, page.locator(YOUTUBE.selectors.playlist.createButton).first());
    await page
      .locator(YOUTUBE.selectors.playlist.createContainer)
      .first()
      .waitFor({ state: 'hidden', timeout: YOUTUBE.timeouts.mediumMs })
      .catch(() => undefined);
  }

  await humanClick(page, page.locator(YOUTUBE.selectors.playlist.doneButtonAria).first());
}

async function setVisibilityOrSchedule(
  page: Page,
  visibility: Visibility,
  schedule: YouTubeScheduleInput | undefined,
): Promise<void> {
  if (schedule !== undefined) {
    validateSchedule(schedule.at);
    const scheduleHost = page.locator(YOUTUBE.selectors.visibility.schedule).first();
    await humanClick(page, scheduleHost.locator(YOUTUBE.selectors.visibility.radioLabel));

    const dateStr = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(schedule.at);

    const timeStr = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(schedule.at);

    await humanClick(page, page.locator(YOUTUBE.selectors.visibility.scheduleDatePicker).first());
    const dateInput = page.locator(YOUTUBE.selectors.visibility.scheduleDateInput).first();
    await humanClick(page, dateInput);
    await dateInput.fill('');
    await page.keyboard.type(dateStr);
    await page.keyboard.press('Enter');

    const timeInput = page.locator(YOUTUBE.selectors.visibility.scheduleTimeInput).first();
    await humanClick(page, timeInput);
    await timeInput.fill('');
    await page.keyboard.type(timeStr);
    await page.keyboard.press('Enter');
  } else {
    const host = page.locator(YOUTUBE.selectors.visibility[visibility]).first();
    await humanClick(page, host.locator(YOUTUBE.selectors.visibility.radioLabel));
  }
}

async function detectVideoUrl(
  page: Page,
  timeoutMs: number = YOUTUBE.timeouts.mediumMs,
): Promise<YouTubeUploadResult> {
  try {
    const anchor = page.locator(YOUTUBE.selectors.progress.videoUrlAnchor).first();
    await anchor.waitFor({ state: 'visible', timeout: timeoutMs });
    const href = await anchor.getAttribute('href');
    return href !== null ? { videoUrl: href } : {};
  } catch {
    return {};
  }
}

async function findUploadError(page: Page): Promise<string | null> {
  const error = page.locator(YOUTUBE.selectors.progress.error).first();
  const visible = await isLocatorVisible(error, 1000);
  if (!visible) return null;

  const text = (await error.innerText().catch(() => '')).trim();
  return text.length > 0 ? text : 'YouTube reported an upload error';
}

export function parseYouTubeUploadProgress(text: string): {
  complete: boolean;
  started: boolean;
  percent?: number;
} {
  const percents = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    .map((match) => Number.parseFloat(match[1] as string))
    .filter((value) => Number.isFinite(value));
  const percent = percents.length > 0 ? Math.max(...percents) : undefined;
  const lower = text.toLowerCase();
  const complete =
    (percent !== undefined && percent >= 100) ||
    lower.includes('upload complete') ||
    lower.includes('processing complete') ||
    lower.includes('checks complete');
  const started =
    complete ||
    (percent !== undefined && percent > 0) ||
    lower.includes('processing') ||
    lower.includes('checking');

  return {
    complete,
    started,
    ...(percent !== undefined && { percent }),
  };
}

async function waitForDoneReadiness(page: Page): Promise<void> {
  const doneButton = page.locator(YOUTUBE.selectors.nav.doneButton).first();
  await doneButton.waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.longMs });

  await page.waitForFunction(
    ({ doneSelector, errorSelector, progressSelector }) => {
      const error = document.querySelector(errorSelector);
      if (error?.textContent?.trim()) return 'error';

      const done = document.querySelector(doneSelector);
      if (done === null) return false;

      const doneEnabled =
        done.getAttribute('aria-disabled') !== 'true' &&
        !done.hasAttribute('disabled') &&
        done.getAttribute('disabled') === null;
      if (!doneEnabled) return false;

      const progressText = document.querySelector(progressSelector)?.textContent ?? '';
      const percents = Array.from(progressText.matchAll(/(\d+(?:\.\d+)?)\s*%/g))
        .map((match) => {
          const rawPercent = match[1];
          return rawPercent === undefined ? Number.NaN : Number.parseFloat(rawPercent);
        })
        .filter((value) => Number.isFinite(value));
      const percent = percents.length > 0 ? Math.max(...percents) : undefined;
      const lower = progressText.toLowerCase();
      return (
        (percent !== undefined && percent > 0) ||
        lower.includes('upload complete') ||
        lower.includes('processing') ||
        lower.includes('checking') ||
        lower.includes('checks complete')
      );
    },
    {
      doneSelector: YOUTUBE.selectors.nav.doneButton,
      errorSelector: YOUTUBE.selectors.progress.error,
      progressSelector: YOUTUBE.selectors.progress.uploadStatus,
    },
    { timeout: YOUTUBE.timeouts.uploadProcessingMs },
  );

  const error = await findUploadError(page);
  if (error !== null) throw new Error(`YouTube upload failed: ${error}`);
}

// ---------------------------------------------------------------------------
// Public orchestration
// ---------------------------------------------------------------------------

export async function completeUpload(
  page: Page,
  input: YouTubeUploadInput,
): Promise<YouTubeUploadResult> {
  const {
    videoPath,
    thumbnailPath,
    title,
    description,
    tags,
    playlist,
    madeForKids = false,
    visibility = 'private',
    schedule,
  } = input;

  // 1. Navigate to Studio and open the real upload dialog.
  await openUploadFlow(page);
  // Wait for logged-in signal (avatar or channel rail)
  await Promise.race([
    page
      .locator(YOUTUBE.selectors.loginIndicators.ytStudioAvatar)
      .first()
      .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.longMs }),
    page
      .locator(YOUTUBE.selectors.loginIndicators.channelSideRail)
      .first()
      .waitFor({ state: 'visible', timeout: YOUTUBE.timeouts.longMs }),
    page
      .locator(YOUTUBE.selectors.upload.fileInput)
      .first()
      .waitFor({ state: 'attached', timeout: YOUTUBE.timeouts.longMs }),
  ]).catch(() => {
    // If none appear, proceed anyway — login check is done by caller via isLoggedIn
  });

  // 2. Upload file
  await setVideo(page, videoPath);

  // 3. Title + Description
  await fillMetadata(page, title, description);

  // 3b. Custom thumbnail (source uploader supported this via input#file-loader)
  if (thumbnailPath !== undefined) {
    await setThumbnail(page, thumbnailPath);
  }

  // 4. Tags (Show more must be clicked first)
  if (tags !== undefined && tags.length > 0) {
    await fillTags(page, tags);
  }

  // 5. Audience
  await setAudience(page, madeForKids);

  // 6. Playlist
  if (playlist !== undefined) {
    await addToPlaylist(page, playlist);
  }

  // 7. NEXT x3 (4 wizard tabs; 3 clicks reach the Visibility tab)
  for (let i = 0; i < 3; i++) {
    await humanClick(page, page.locator(YOUTUBE.selectors.nav.nextButton).first());
    await jitterSleep(1500, 0.5);
  }

  // 8. Visibility / Schedule
  await setVisibilityOrSchedule(page, visibility, schedule);

  // 9. Wait for upload readiness/errors before Done.
  await waitForDoneReadiness(page);
  const result = await detectVideoUrl(page);
  await humanClick(page, page.locator(YOUTUBE.selectors.nav.doneButton).first());
  await jitterSleep(2000, 0.5);

  return result;
}
