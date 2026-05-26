import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, jitterSleep, selectAllShortcut } from '../../core/humanize.js';
import { humanClick } from '../../core/mouse.js';
import { X } from './selectors.js';

export type ComposeMode = 'sidebar' | 'standalone';

export interface XComposeInput {
  text: string;
  mediaPaths?: string[];
  mode?: ComposeMode;
  postToCommunity?: boolean;
  communityName?: string;
  communityId?: string;
  typingSpeedMultiplier?: number;
  wordPauseMaxMs?: number;
  dryRun?: boolean;
  onLog?: (message: string, detail?: string) => void;
}

export interface XComposeResult {
  tweetUrl?: string;
}

// XPath prefix helper
const xp = (s: string) => `xpath=${s}`;

interface XOpenedComposer {
  textAreaSelector: string;
  postButtonSelector: string;
  textAreaLocator: Locator;
}

function logX(input: XComposeInput, message: string, detail?: string): void {
  input.onLog?.(message, detail);
}

// ---------------------------------------------------------------------------
// filterMediaForX — pure, exported for tests
// ---------------------------------------------------------------------------

export function filterMediaForX(paths: string[]): string[] {
  if (paths.length === 0) return [];

  const videoExts = new Set(['.mp4', '.mov', '.m4v', '.webm']);
  const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

  const images: string[] = [];
  const videos: string[] = [];
  const others: string[] = [];

  for (const p of paths) {
    const dotIndex = p.lastIndexOf('.');
    const ext = dotIndex !== -1 ? p.slice(dotIndex).toLowerCase() : '';
    if (videoExts.has(ext)) {
      videos.push(p);
    } else if (imageExts.has(ext)) {
      images.push(p);
    } else {
      others.push(p);
    }
  }

  if (videos.length > 0) {
    return [videos[0] as string];
  }

  if (images.length > 0) {
    return images.slice(0, X.limits.maxImagesPerTweet);
  }

  return others.slice(0, 1);
}

function xpathLiteral(value: string): string {
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  return `concat(${value
    .split("'")
    .map((part) => `'${part}'`)
    .join(', "\'", ')})`;
}

async function clickSafely(page: Page, locator: Locator): Promise<boolean> {
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: X.timeouts.shortMs }).catch(() => undefined);
    await humanClick(page, locator);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Hydration helpers
// ---------------------------------------------------------------------------

class XHomeHydrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XHomeHydrationError';
  }
}

async function waitForXHomeHydrated(page: Page): Promise<void> {
  try {
    await page.goto(X.urls.home, { waitUntil: 'domcontentloaded' });
    await page
      .locator(xp(X.selectors.loginIndicators.primaryColumn))
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await jitterSleep(800, 0.3);
  } catch (err) {
    if (err instanceof XHomeHydrationError) throw err;
    throw new XHomeHydrationError(
      `X /home failed to hydrate: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------

async function scrollAudienceContainer(container: Locator): Promise<void> {
  await container
    .evaluate((node) => {
      const candidates = [node, ...Array.from(node.querySelectorAll('div'))] as HTMLElement[];
      const scrollable = candidates.find((el) => el.scrollHeight > el.clientHeight + 20);
      if (scrollable !== undefined) scrollable.scrollTop += 300;
    })
    .catch(() => undefined);
}

async function selectCommunityIfConfigured(page: Page, input: XComposeInput): Promise<void> {
  const communityName = input.communityName?.trim();
  const communityId = input.communityId?.trim();
  const shouldSelect =
    input.postToCommunity === true || communityName !== undefined || communityId !== undefined;

  if (!shouldSelect) return;
  if (!communityName && !communityId) return;

  await page
    .locator(X.selectors.overlays.twcCcMask)
    .waitFor({ state: 'hidden', timeout: 3000 })
    .catch(() => undefined);

  const audienceButton = page.locator(xp(X.selectors.audience.chooseAudienceButton)).first();
  await audienceButton.waitFor({ state: 'visible', timeout: X.timeouts.mediumMs });
  const audienceEnabled = await audienceButton
    .isEnabled({ timeout: X.timeouts.shortMs })
    .catch(() => false);
  if (!audienceEnabled) {
    throw new Error(
      'X audience picker is visible but disabled; cannot select a community audience',
    );
  }
  if (!(await clickSafely(page, audienceButton))) {
    throw new Error('Could not open X audience picker');
  }

  const container = page.locator(xp(X.selectors.audience.container)).first();
  await container.waitFor({ state: 'visible', timeout: X.timeouts.mediumMs });

  for (let attempt = 0; attempt < 15; attempt++) {
    if (communityId !== undefined) {
      const communityHref = xpathLiteral(`/i/communities/${communityId}`);
      const byId = container
        .locator(
          `xpath=.//*[@role='menuitem' and .//a[contains(@href, ${communityHref})]] | .//a[contains(@href, ${communityHref})]/ancestor::*[@role='menuitem'][1]`,
        )
        .first();
      if ((await isLocatorVisible(byId, 1000)) && (await clickSafely(page, byId))) {
        await container
          .waitFor({ state: 'hidden', timeout: X.timeouts.mediumMs })
          .catch(() => undefined);
        return;
      }
    }

    if (communityName !== undefined) {
      const byName = container.getByRole('menuitem').filter({ hasText: communityName }).first();
      if ((await isLocatorVisible(byName, 1000)) && (await clickSafely(page, byName))) {
        await container
          .waitFor({ state: 'hidden', timeout: X.timeouts.mediumMs })
          .catch(() => undefined);
        return;
      }
    }

    await scrollAudienceContainer(container);
    await jitterSleep(800, 0.4);
  }

  throw new Error(
    `Could not select X community audience: ${communityName ?? communityId ?? 'unknown community'}`,
  );
}

async function openSidebarComposer(page: Page): Promise<{
  textAreaSelector: string;
  postButtonSelector: string;
}> {
  await page.goto(X.urls.home, { waitUntil: 'domcontentloaded' });
  await jitterSleep(2000, 0.5);

  await page.locator(xp(X.selectors.sidebarCompose.newTweetButton)).waitFor({
    state: 'visible',
    timeout: X.timeouts.mediumMs,
  });
  await humanClick(page, page.locator(xp(X.selectors.sidebarCompose.newTweetButton)).first());
  await jitterSleep(1500, 0.4);

  await page
    .locator(xp(X.selectors.sidebarCompose.layers))
    .waitFor({ state: 'attached', timeout: X.timeouts.mediumMs });

  return {
    textAreaSelector: xp(X.selectors.sidebarCompose.textArea),
    postButtonSelector: xp(X.selectors.sidebarCompose.postButtonFallback),
  };
}

function xTextEditorCandidates(page: Page): Locator[] {
  return [
    page.locator(X.selectors.composer.textEditor),
    page.locator("[data-testid^='tweetTextarea_']"),
    page.locator(`${X.selectors.composer.modal} [contenteditable='true'][role='textbox']`),
    page.locator("[contenteditable='true'][role='textbox']"),
    page.getByRole('textbox', { name: /^(Post text|Tweet text|What's happening\?)$/i }),
  ];
}

async function resolveXTextEditor(page: Page, timeoutMs: number): Promise<Locator> {
  let lastError: unknown = null;
  for (const locator of xTextEditorCandidates(page)) {
    const candidate = locator.first();
    try {
      await candidate.waitFor({ state: 'visible', timeout: timeoutMs });
      return candidate;
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(
    `Could not find visible X composer text editor: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function openStandaloneComposer(page: Page): Promise<{
  textAreaSelector: string;
  postButtonSelector: string;
  textAreaLocator: Locator;
}> {
  await waitForXHomeHydrated(page);
  await page.goto(X.urls.composePost, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
  await page
    .locator(xp(X.selectors.loginIndicators.primaryColumn))
    .first()
    .waitFor({ state: 'visible', timeout: X.timeouts.shortMs })
    .catch(() => undefined);
  await jitterSleep(1200, 0.5);

  const textAreaLocator = await resolveXTextEditor(page, X.timeouts.mediumMs);

  return {
    textAreaSelector: X.selectors.composer.textEditor,
    postButtonSelector: X.selectors.composer.postButton,
    textAreaLocator,
  };
}

async function openSidebarComposerWithEditor(page: Page): Promise<XOpenedComposer> {
  const composer = await openSidebarComposer(page);
  return {
    ...composer,
    textAreaLocator: await resolveXTextEditor(page, X.timeouts.mediumMs),
  };
}

function expectedNormalizedText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

async function textEditorValue(locator: Locator): Promise<string> {
  const value = await locator
    .evaluate((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
    .catch(() => '');
  return value;
}

async function typeAndVerifyXText(
  page: Page,
  locator: Locator,
  text: string,
  options: {
    typingSpeedMultiplier?: number;
    wordPauseMaxMs?: number;
    clearFirst?: boolean;
    allowDestructiveFallback?: boolean;
  } = {},
): Promise<void> {
  const clearFirst = options.clearFirst ?? true;
  const allowDestructiveFallback = options.allowDestructiveFallback ?? true;
  await humanType(locator, text, {
    clearFirst,
    naturalCadence: true,
    ...(options.typingSpeedMultiplier !== undefined && {
      typingSpeedMultiplier: options.typingSpeedMultiplier,
    }),
    ...(options.wordPauseMaxMs !== undefined && { wordPauseMaxMs: options.wordPauseMaxMs }),
  });
  await jitterSleep(700, 0.4);

  const expected = expectedNormalizedText(text);
  if (expected.length === 0) return;
  const typedText = await textEditorValue(locator);
  if (typedText.includes(expected)) return;

  if (!allowDestructiveFallback) {
    throw new Error(
      'Could not verify X composer text and destructive fallback is disabled because media is attached',
    );
  }

  await locator.focus().catch(async () => {
    await humanClick(page, locator);
  });
  await page.keyboard.press(selectAllShortcut());
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(text);
  await jitterSleep(400, 0.4);

  const fallbackText = await textEditorValue(locator);
  if (!fallbackText.includes(expected)) {
    throw new Error('Could not verify X composer text after typing fallback');
  }
}

async function detectPostedTweetUrl(page: Page, text: string): Promise<string | undefined> {
  const needle = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (needle.length < 8) return undefined;

  await page.goto(X.urls.home, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page
    .locator(xp(X.selectors.article.tweetArticle))
    .first()
    .waitFor({ state: 'visible', timeout: X.timeouts.mediumMs })
    .catch(() => undefined);

  const articles = await page.locator(xp(X.selectors.article.tweetArticle)).all();
  for (const article of articles.slice(0, 10)) {
    const body = (await article.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!body.includes(needle)) continue;

    const href = await article
      .locator(`xpath=.${X.selectors.article.statusLink}`)
      .first()
      .getAttribute('href')
      .catch(() => null);
    if (href !== null && href.length > 0) {
      return new URL(href, 'https://x.com').href;
    }
  }

  return undefined;
}

/** Exported for unit tests. Polls until the Post button is stably visible and enabled. */
export async function waitForStableXPostButtonEnabled(
  page: Page,
  postButtonSelector: string,
  timeoutMs: number,
): Promise<void> {
  const locator = page.locator(postButtonSelector).first();
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });

  const deadline = Date.now() + timeoutMs;
  let consecutiveEnabled = 0;
  while (Date.now() < deadline) {
    const visible = await locator.isVisible().catch(() => false);
    const ariaDisabled = await locator.getAttribute('aria-disabled').catch(() => 'true');
    const isDisabled = await locator.isDisabled().catch(() => true);
    if (visible && ariaDisabled !== 'true' && !isDisabled) {
      consecutiveEnabled += 1;
      if (consecutiveEnabled >= 2) return;
    } else {
      consecutiveEnabled = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`X Post button did not stabilize as enabled within ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// postTweet — main public function
// ---------------------------------------------------------------------------

export async function postTweet(page: Page, input: XComposeInput): Promise<XComposeResult> {
  const mode = input.mode ?? 'standalone';
  const text = (input.text ?? '').slice(0, X.limits.maxTweetLength);
  const mediaPaths =
    input.mediaPaths !== undefined && input.mediaPaths.length > 0
      ? filterMediaForX(input.mediaPaths)
      : [];

  const hasText = text.trim().length > 0;
  if (!hasText && mediaPaths.length === 0) {
    throw new Error('postTweet requires either text or media');
  }

  let composer: XOpenedComposer;

  // --- Step 1: Navigate and open composer ---
  if (mode === 'sidebar') {
    logX(input, 'Opening X sidebar composer');
    composer = await openSidebarComposerWithEditor(page);
  } else {
    logX(input, 'Opening X standalone composer');
    try {
      composer = await openStandaloneComposer(page);
    } catch (err) {
      if (err instanceof XHomeHydrationError) {
        throw err; // do NOT fall back to sidebar — sidebar also depends on /home hydration
      }
      logX(
        input,
        'X standalone composer failed; falling back to sidebar',
        err instanceof Error ? err.message : String(err),
      );
      composer = await openSidebarComposerWithEditor(page);
    }
  }
  logX(input, 'X composer editor found');

  // --- Step 2: Select audience/community before typing or uploading media ---
  const { textAreaSelector, postButtonSelector } = composer;
  let textAreaLocator = composer.textAreaLocator;
  await humanClick(page, textAreaLocator).catch(() => undefined);
  await selectCommunityIfConfigured(page, input);

  // Audience selection can rerender the composer; reacquire the textarea before typing.
  textAreaLocator = await resolveXTextEditor(page, X.timeouts.shortMs).catch(
    () => composer.textAreaLocator,
  );

  // --- Step 3: Attach media first (if any), then type text ---
  if (mediaPaths.length > 0) {
    // Pre-clear while editor is empty of media (safe — no attachment yet)
    await humanType(textAreaLocator, '', { clearFirst: true });

    const fileInputLocator = page.locator(X.selectors.composer.fileInput).first();
    await fileInputLocator.setInputFiles(mediaPaths);

    await waitForStableXPostButtonEnabled(page, postButtonSelector, X.timeouts.postReadyMs);
    logX(input, 'X media attached and post button stable');

    // Re-acquire editor — ProseMirror may have remounted after attachment
    textAreaLocator = await resolveXTextEditor(page, X.timeouts.shortMs).catch(
      () => textAreaLocator,
    );
    await jitterSleep(800, 0.5);
  }

  if (hasText) {
    logX(input, 'Typing X post text');
    await typeAndVerifyXText(page, textAreaLocator, text, {
      ...(input.typingSpeedMultiplier !== undefined && {
        typingSpeedMultiplier: input.typingSpeedMultiplier,
      }),
      ...(input.wordPauseMaxMs !== undefined && { wordPauseMaxMs: input.wordPauseMaxMs }),
      clearFirst: mediaPaths.length === 0,
      allowDestructiveFallback: mediaPaths.length === 0,
    });
    logX(input, 'X post text verified');
    await jitterSleep(1200, 0.4);
  }

  // --- Step 4: Wait for overlay to disappear (best-effort, 3s timeout) ---
  try {
    await page.locator(X.selectors.overlays.twcCcMask).waitFor({ state: 'hidden', timeout: 3000 });
  } catch {
    // Mask never appeared or already gone — fine
  }

  // --- Step 5: Wait for post button to be stably enabled ---
  await waitForStableXPostButtonEnabled(page, postButtonSelector, X.timeouts.shortMs);
  logX(input, 'X post button stable; clicking submit');

  // --- Step 6: Dry-run check ---
  if (input.dryRun === true) {
    logX(input, 'X post ready for manual submit');
    console.log('[x] dry-run: would click "Post" to submit');
    return {};
  }

  // --- Step 7: Click Post with conditional Escape-dismiss + 3-tier fallback ---
  // Tier 1: Trial-click probe → press Escape ONLY if intercepted → safely dismiss any
  //   "Save post?" dialog that appears (Escape, not Discard) → native click (actionability check).
  // Tier 2: humanClick with raw mouse coords (bypasses Playwright actionability check;
  //   helps on transient races, but browser hit-testing still routes the click to whatever
  //   element is on top — does NOT force past real overlay coverage).
  // Tier 3: keyboard Ctrl+Enter (fully bypasses pointer hit-testing).

  const postLocator = page.locator(postButtonSelector).first();
  const saveDialogLocator = page.locator('[data-testid="confirmationSheetDialog"]').first();

  // Helper closures keep the flow linear and readable.
  const probeClickable = async (): Promise<boolean> => {
    try {
      await postLocator.click({ trial: true, timeout: 1500 });
      return true;
    } catch {
      return false;
    }
  };

  const saveDialogVisible = async (): Promise<boolean> =>
    saveDialogLocator.isVisible({ timeout: 500 }).catch(() => false);

  // Close the Save-post dialog with Escape — NOT Discard (which discards the post) and NOT
  // Save (which routes the post to drafts). Then verify the composer textarea is still visible.
  const dismissSavePostDialog = async (): Promise<void> => {
    logX(input, 'X Save-post dialog detected; pressing Escape to dismiss (preserving content)');
    await page.keyboard.press('Escape');
    await jitterSleep(1000, 0.2);
    const composerStillVisible = await page
      .locator(textAreaSelector)
      .first()
      .isVisible({ timeout: 1500 })
      .catch(() => false);
    if (!composerStillVisible) {
      throw new Error(
        'X composer disappeared after Save-post dialog dismiss; cannot recover the post',
      );
    }
  };

  // Step 1: probe BEFORE pressing any Escape. If the button is already clickable, do nothing.
  let clickable = await probeClickable();

  if (!clickable) {
    logX(input, 'X Post button intercepted; pressing Escape to dismiss overlay');
    await page.keyboard.press('Escape');
    await jitterSleep(2000, 0.2);

    // The Escape may have surfaced X's "Save post?" dialog. If so, dismiss safely.
    if (await saveDialogVisible()) {
      await dismissSavePostDialog();
    }

    clickable = await probeClickable();

    // Stacked-overlay case: one more Escape, then re-check.
    if (!clickable) {
      logX(input, 'X Post button still intercepted; pressing Escape again');
      await page.keyboard.press('Escape');
      await jitterSleep(2000, 0.2);

      if (await saveDialogVisible()) {
        await dismissSavePostDialog();
      }
    }
  }

  let postClickError: unknown;
  try {
    await postLocator.click({ timeout: X.timeouts.shortMs });
    postClickError = null;
  } catch (err) {
    logX(
      input,
      'X native click failed; falling back to humanClick',
      err instanceof Error ? err.message : String(err),
    );
    postClickError = err;
  }

  if (postClickError !== null) {
    // Tier 2: humanClick with raw mouse coords after scrolling into view. Bypasses Playwright's
    // actionability check, but browser hit-testing still routes the click to whatever element is
    // on top — does NOT force past real overlay coverage.
    try {
      const fallback = page.locator(postButtonSelector).first();
      await fallback.scrollIntoViewIfNeeded({ timeout: X.timeouts.shortMs }).catch(() => undefined);
      await humanClick(page, fallback);
      postClickError = null;
    } catch (err) {
      postClickError = err;
    }
  }

  if (postClickError !== null) {
    // Tier 3: keyboard Ctrl+Enter
    try {
      await textAreaLocator.focus();
      await page.keyboard.press('Control+Enter');
      postClickError = null;
    } catch (err) {
      postClickError = err;
    }
  }

  if (postClickError !== null) {
    throw new Error(
      `Failed to click post button via all three methods: ${postClickError instanceof Error ? postClickError.message : String(postClickError)}`,
    );
  }

  // --- Step 7: Wait for submission confirmation ---
  const composerGone = page
    .locator(textAreaSelector)
    .waitFor({ state: 'hidden', timeout: X.timeouts.longMs })
    .then(() => 'gone' as const);

  const navigatedAway = page
    .waitForURL((url) => !url.href.includes('/compose'), { timeout: X.timeouts.longMs })
    .then(() => 'navigated' as const);

  const confirmed = await Promise.race([
    composerGone,
    navigatedAway,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), X.timeouts.longMs)),
  ]);

  if (confirmed === 'timeout') {
    throw new Error('Tweet may not have been posted (no confirmation signal)');
  }

  const tweetUrl = await detectPostedTweetUrl(page, text);
  return tweetUrl !== undefined ? { tweetUrl } : {};
}
