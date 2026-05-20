import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, jitterSleep } from '../../core/humanize.js';
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
  dryRun?: boolean;
}

export interface XComposeResult {
  tweetUrl?: string;
}

// XPath prefix helper
const xp = (s: string) => `xpath=${s}`;

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

async function openStandaloneComposer(page: Page): Promise<{
  textAreaSelector: string;
  postButtonSelector: string;
}> {
  await page.goto(X.urls.composePost, { waitUntil: 'domcontentloaded' });
  await jitterSleep(2000, 0.5);

  await page.locator(X.selectors.composer.textEditor).waitFor({
    state: 'visible',
    timeout: X.timeouts.mediumMs,
  });

  return {
    textAreaSelector: X.selectors.composer.textEditor,
    postButtonSelector: X.selectors.composer.postButton,
  };
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

  let composer: { textAreaSelector: string; postButtonSelector: string };

  // --- Step 1: Navigate and open composer ---
  if (mode === 'sidebar') {
    composer = await openSidebarComposer(page);
  } else {
    composer = await openStandaloneComposer(page).catch(() => openSidebarComposer(page));
  }

  // --- Step 2: Select audience/community before typing or uploading media ---
  const { textAreaSelector, postButtonSelector } = composer;
  let textAreaLocator = page.locator(textAreaSelector).first();
  await humanClick(page, textAreaLocator).catch(() => undefined);
  await selectCommunityIfConfigured(page, input);

  // Audience selection can rerender the composer; reacquire the textarea before typing.
  textAreaLocator = page.locator(textAreaSelector).first();
  await humanType(textAreaLocator, text, { clearFirst: true });
  await jitterSleep(1200, 0.4);

  // --- Step 3: Attach media (if any) ---
  if (mediaPaths.length > 0) {
    const fileInputLocator = page.locator(X.selectors.composer.fileInput).first();
    await fileInputLocator.setInputFiles(mediaPaths);

    // Wait for post button to become enabled (upload settled)
    const postBtnLocator = page.locator(postButtonSelector).first();
    await postBtnLocator.waitFor({ state: 'visible', timeout: X.timeouts.postReadyMs });
    await postBtnLocator
      .waitFor({ state: 'visible', timeout: X.timeouts.postReadyMs })
      .catch(() => undefined);
    // Poll until aria-disabled is removed
    for (let i = 0; i < 60; i++) {
      const disabled = await postBtnLocator.getAttribute('aria-disabled').catch(() => 'true');
      const isDisabled = await postBtnLocator.isDisabled().catch(() => true);
      if (disabled !== 'true' && !isDisabled) break;
      await jitterSleep(500, 0.1);
    }

    await jitterSleep(800, 0.5);
  }

  // --- Step 4: Wait for overlay to disappear (best-effort, 3s timeout) ---
  try {
    await page.locator(X.selectors.overlays.twcCcMask).waitFor({ state: 'hidden', timeout: 3000 });
  } catch {
    // Mask never appeared or already gone — fine
  }

  // --- Step 5: Dry-run check ---
  if (input.dryRun === true) {
    console.log('[x] dry-run: would click "Post" to submit');
    return {};
  }

  // --- Step 6: Three-tier post click fallback ---
  let postClickError: unknown;
  try {
    await humanClick(page, page.locator(postButtonSelector).first());
    postClickError = null;
  } catch (err) {
    postClickError = err;
  }

  if (postClickError !== null) {
    // Tier 2: mouse click after scrolling the fallback into view.
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
