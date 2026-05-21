import { type Locator, type Page, isLocatorVisible } from '../../core/browser.js';
import { humanType, jitterSleep } from '../../core/humanize.js';
import { humanClick } from '../../core/mouse.js';
import { LINKEDIN } from './selectors.js';

export interface LinkedInComposeInput {
  text: string;
  imagePath?: string;
  target?: 'profile' | 'company';
  companyPageUrl?: string;
  linkedinPostType?: 'post' | 'article';
  linkedinCompanyId?: string;
  /** Article title (article flow only) */
  title?: string;
  /** Optional intro text typed into the share modal after clicking Next (article flow only) */
  shareIntro?: string;
  /** When true, executes all steps but skips the final publish/post click */
  dryRun?: boolean;
}

export interface LinkedInComposeResult {
  postUrl?: string;
  /** Set to true when dryRun mode was active and the final submit was skipped */
  dryRun?: boolean;
  success?: boolean;
}

async function collectFeedPostUrns(page: Page): Promise<string[]> {
  return page
    .locator(LINKEDIN.selectors.feed.sharedUpdateContainer)
    .evaluateAll((posts) =>
      posts
        .map((post) => post.getAttribute('data-urn'))
        .filter((urn): urn is string => urn !== null && urn.length > 0),
    )
    .catch(() => []);
}

export function getCompanyPageCandidateUrls(pageUrl: string): string[] {
  const parsed = new URL(pageUrl);
  if (!parsed.hostname.endsWith('linkedin.com')) {
    throw new Error('LinkedIn company page URL must be on linkedin.com');
  }

  parsed.hash = '';
  parsed.search = '';
  const original = parsed.href;
  const match = parsed.pathname.match(/^\/company\/([^/]+)/);
  if (match === null) return [original];

  const slug = match[1] as string;
  return [
    original,
    `${parsed.origin}/company/${slug}/admin/`,
    `${parsed.origin}/company/${slug}/admin/dashboard/`,
    `${parsed.origin}/company/${slug}/admin/feed/posts/`,
  ].filter((url, index, urls) => urls.indexOf(url) === index);
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

async function waitForFeedConfirmation(
  page: Page,
  knownUrns: string[],
  text: string,
): Promise<LinkedInComposeResult> {
  const needle = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

  const urn = await page
    .waitForFunction(
      ({ selector, known, expectedText }) => {
        const knownSet = new Set(known);
        const posts = Array.from(document.querySelectorAll(selector));
        const textMatches = (post: Element) => {
          if (expectedText.length < 8) return true;
          return (post.textContent ?? '').replace(/\s+/g, ' ').includes(expectedText);
        };
        const candidate =
          known.length === 0
            ? posts.find((post) => textMatches(post))
            : posts.find((post) => {
                const dataUrn = post.getAttribute('data-urn');
                return (
                  dataUrn !== null &&
                  dataUrn.length > 0 &&
                  !knownSet.has(dataUrn) &&
                  textMatches(post)
                );
              });

        if (candidate === undefined) return false;
        if (known.length === 0) return 'visible';
        return candidate.getAttribute('data-urn') ?? 'visible';
      },
      {
        selector: LINKEDIN.selectors.feed.sharedUpdateContainer,
        known: knownUrns,
        expectedText: needle,
      },
      { timeout: LINKEDIN.timeouts.longMs },
    )
    .then((handle) => handle.jsonValue() as Promise<string>)
    .catch(() => null);

  if (urn === null) {
    throw new Error('Post may not have been published (no feed update confirmation)');
  }

  return urn !== 'visible' ? { postUrl: `https://www.linkedin.com/feed/update/${urn}/` } : {};
}

async function waitForPublishedToast(page: Page): Promise<LinkedInComposeResult> {
  const toast = page
    .locator(LINKEDIN.selectors.feed.postPublishedToast)
    .filter({ hasText: /post|published|shared|sent/i })
    .first();
  await toast.waitFor({ state: 'visible', timeout: LINKEDIN.timeouts.longMs });
  const text = (await toast.innerText().catch(() => '')).trim();
  if (/couldn't|failed|error|unable/i.test(text)) {
    throw new Error(`LinkedIn reported a publish failure: ${text}`);
  }
  return {};
}

async function waitForPublishConfirmation(
  page: Page,
  knownUrns: string[],
  text: string,
  toastPromise: Promise<LinkedInComposeResult>,
): Promise<LinkedInComposeResult> {
  try {
    return await Promise.any([toastPromise, waitForFeedConfirmation(page, knownUrns, text)]);
  } catch {
    throw new Error('Post may not have been published (no toast or feed update confirmation)');
  }
}

export function resolveLinkedInPostUrl(input: LinkedInComposeInput): {
  url: string;
  type: 'post' | 'article';
  isCompany: boolean;
} {
  const isCompany = Boolean(input.linkedinCompanyId);
  const requested = input.linkedinPostType ?? 'post';

  // Personal + 'post' has no direct URL — fall back to article
  let effectiveType: 'post' | 'article' = requested;
  if (requested === 'post' && !isCompany) {
    process.stderr.write(
      '[linkedin] post type requested for personal account but no personal short-share URL exists; falling back to article\n',
    );
    effectiveType = 'article';
  }

  // isCompany is true when linkedinCompanyId is set; narrow via the local flag
  const companyId = input.linkedinCompanyId ?? '';

  if (effectiveType === 'post') {
    return {
      url: `https://www.linkedin.com/company/${encodeURIComponent(companyId)}/admin/page-posts/published/?share=true`,
      type: 'post',
      isCompany: true,
    };
  }
  // article
  if (isCompany) {
    return {
      url: `https://www.linkedin.com/article/new/?author=urn%3Ali%3Afsd_company%3A${encodeURIComponent(companyId)}`,
      type: 'article',
      isCompany: true,
    };
  }
  return { url: 'https://www.linkedin.com/article/new/', type: 'article', isCompany: false };
}

async function createPostViaDirectUrl(
  page: Page,
  input: LinkedInComposeInput,
): Promise<LinkedInComposeResult> {
  const { mediumMs, longMs } = LINKEDIN.timeouts;
  const resolved = resolveLinkedInPostUrl(input);

  await page.goto(resolved.url, { waitUntil: 'domcontentloaded' });
  await jitterSleep(1500, 0.6);

  const clampedText = input.text.slice(0, LINKEDIN.limits.maxPostLength);

  if (resolved.type === 'post') {
    // Company-share short post flow
    let editorLocator = page.locator(LINKEDIN.selectors.companyShare.textEditor).first();
    const editorVisible = await isLocatorVisible(editorLocator, mediumMs);
    if (!editorVisible) {
      editorLocator = page.locator(LINKEDIN.selectors.composer.textEditorAria).first();
    }

    await humanClick(page, editorLocator);
    await humanType(editorLocator, clampedText);

    if (input.dryRun) {
      process.stderr.write('[linkedin] dry-run: would click "Post" to submit\n');
      return { success: true, dryRun: true } as LinkedInComposeResult;
    }

    const postButtonSelector = LINKEDIN.selectors.companyShare.postButton;
    await page.waitForFunction(
      (selector: string) => {
        const el = document.querySelector(selector);
        return el ? !(el as HTMLButtonElement).disabled : false;
      },
      postButtonSelector,
      { timeout: mediumMs },
    );

    let postClickError: unknown = null;
    try {
      await humanClick(page, page.locator(postButtonSelector).first());
    } catch (err) {
      postClickError = err;
    }

    if (postClickError !== null) {
      throw new Error(
        `Failed to click Post button: ${postClickError instanceof Error ? postClickError.message : String(postClickError)}`,
      );
    }

    const toastPromise = waitForPublishedToast(page);
    toastPromise.catch(() => undefined);
    return waitForPublishConfirmation(page, [], clampedText, toastPromise);
  }

  // Article flow — two stages
  // Stage 1: article editor page
  await page.locator(LINKEDIN.selectors.article.titleTextarea).first().waitFor({
    state: 'visible',
    timeout: mediumMs,
  });

  if (input.title !== undefined && input.title.trim().length > 0) {
    const titleLocator = page.locator(LINKEDIN.selectors.article.titleTextarea).first();
    await humanClick(page, titleLocator);
    await humanType(titleLocator, input.title);
  }

  const bodyLocator = page.locator(LINKEDIN.selectors.article.bodyEditor).first();
  await humanClick(page, bodyLocator);
  await humanType(bodyLocator, clampedText);

  await jitterSleep(800, 0.4);
  await humanClick(page, page.locator(LINKEDIN.selectors.article.nextButton).first());

  // Stage 2: share modal
  await page.locator(LINKEDIN.selectors.article.shareModal).first().waitFor({
    state: 'visible',
    timeout: longMs,
  });
  await jitterSleep(800, 0.4);

  if (input.shareIntro !== undefined && input.shareIntro.trim().length > 0) {
    const introLocator = page.locator(LINKEDIN.selectors.article.shareModalIntroEditor).first();
    await humanClick(page, introLocator);
    await humanType(introLocator, input.shareIntro);
  }

  if (input.dryRun) {
    process.stderr.write('[linkedin] dry-run: would click "Publish" to submit\n');
    return { success: true, dryRun: true } as LinkedInComposeResult;
  }

  await humanClick(page, page.locator(LINKEDIN.selectors.article.shareModalPublishButton).first());

  return {};
}

export async function createPost(
  page: Page,
  input: LinkedInComposeInput,
): Promise<LinkedInComposeResult> {
  // When a numeric/slug company ID is provided, use the direct-URL composer flow
  if (input.linkedinCompanyId !== undefined && input.linkedinCompanyId.trim().length > 0) {
    return createPostViaDirectUrl(page, input);
  }

  const { shortMs, mediumMs, longMs } = LINKEDIN.timeouts;
  const target = input.target ?? (input.companyPageUrl !== undefined ? 'company' : 'profile');

  const clickTrigger = async (): Promise<boolean> =>
    clickFirstVisible(
      page,
      [
        page.locator(LINKEDIN.selectors.composer.startPostTriggerAria),
        page.locator(LINKEDIN.selectors.companyPage.startPostTrigger),
        page.locator(`xpath=${LINKEDIN.selectors.companyPage.startPostTriggerXPath}`),
        page.locator(LINKEDIN.selectors.composer.startPostTrigger),
      ],
      shortMs,
    ).catch(() => false);

  let knownFeedUrns: string[] = [];
  let triggerClicked = false;

  if (target === 'company') {
    if (input.companyPageUrl === undefined || input.companyPageUrl.trim().length === 0) {
      throw new Error('LinkedIn company page URL is required for company page posts');
    }

    const errors: string[] = [];
    for (const url of getCompanyPageCandidateUrls(input.companyPageUrl)) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await jitterSleep(1500, 0.6);
        knownFeedUrns = await collectFeedPostUrns(page);
        triggerClicked = await clickTrigger();
        if (triggerClicked) break;
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!triggerClicked && errors.length > 0) {
      throw new Error(`Could not open LinkedIn company page composer: ${errors.join(' | ')}`);
    }
  } else {
    await page.goto(LINKEDIN.urls.home, { waitUntil: 'domcontentloaded' });
    await jitterSleep(1500, 0.6);
    knownFeedUrns = await collectFeedPostUrns(page);
    triggerClicked = await clickTrigger();
  }

  if (!triggerClicked) {
    throw new Error(
      target === 'company'
        ? 'Could not find LinkedIn company page Start a post trigger; confirm the logged-in account is a page admin'
        : 'Could not find Start a post trigger - selectors may be stale',
    );
  }

  // Safety belt: if modal has not appeared yet, click trigger again.
  await jitterSleep(2500, 0.4);
  const modalVisible = await isLocatorVisible(
    page.locator(LINKEDIN.selectors.composer.modal).first(),
    1000,
  );

  if (!modalVisible) {
    await clickTrigger();
  }

  try {
    await page
      .locator(LINKEDIN.selectors.composer.modal)
      .waitFor({ state: 'visible', timeout: mediumMs });
  } catch {
    await page
      .locator(LINKEDIN.selectors.composer.modalAria)
      .waitFor({ state: 'visible', timeout: mediumMs });
  }
  await jitterSleep(800, 0.5);

  const clampedText = input.text.slice(0, LINKEDIN.limits.maxPostLength);

  let editorLocator = page.locator(LINKEDIN.selectors.composer.textEditorAria).first();
  const editorVisible = await isLocatorVisible(editorLocator, shortMs);
  if (!editorVisible) {
    editorLocator = page.locator(LINKEDIN.selectors.composer.textEditor).first();
  }

  await humanClick(page, editorLocator);
  await humanType(editorLocator, clampedText);

  if (input.imagePath !== undefined) {
    try {
      await humanClick(page, page.locator(LINKEDIN.selectors.composer.imageButtonAria).first());
    } catch {
      throw new Error('Could not find image attach button - selectors may be stale');
    }

    const fileInput = page.locator(LINKEDIN.selectors.composer.fileInput).first();
    await fileInput.setInputFiles(input.imagePath);

    await page
      .locator(LINKEDIN.selectors.composer.imagePreview)
      .waitFor({ state: 'visible', timeout: mediumMs })
      .catch(() => {
        // Preview may not appear immediately; continue.
      });

    await jitterSleep(2500, 0.4);

    try {
      await humanClick(page, page.getByRole('button', { name: 'Next' }));
    } catch {
      // Not present.
    }

    try {
      await humanClick(page, page.getByRole('button', { name: 'Done' }));
    } catch {
      // Not present.
    }
  }

  await page.waitForFunction(
    (selectors: string[]) => {
      const el =
        document.querySelector(selectors[1] as string) ??
        document.querySelector(selectors[0] as string);
      return el ? !(el as HTMLButtonElement).disabled : false;
    },
    [LINKEDIN.selectors.composer.postButton, LINKEDIN.selectors.composer.postButtonAria],
    { timeout: mediumMs },
  );

  if (input.dryRun) {
    process.stderr.write('[linkedin] dry-run: would click "Post" to submit\n');
    return { success: true, dryRun: true } as LinkedInComposeResult;
  }

  let postClickError: unknown = null;

  try {
    const postLocator = page.locator(LINKEDIN.selectors.composer.postButtonAria).first();
    const postVisible = await isLocatorVisible(postLocator, mediumMs);
    if (postVisible) {
      await humanClick(page, postLocator);
    } else {
      await humanClick(page, page.locator(LINKEDIN.selectors.composer.postButton).first());
    }
    postClickError = null;
  } catch (err) {
    postClickError = err;
  }

  if (postClickError !== null) {
    try {
      const ariaFallback = page.locator(LINKEDIN.selectors.composer.postButtonAria).first();
      const bemFallback = page.locator(LINKEDIN.selectors.composer.postButton).first();
      const fallback = (await isLocatorVisible(ariaFallback, 500)) ? ariaFallback : bemFallback;
      if (await isLocatorVisible(fallback, 500)) {
        await humanClick(page, fallback);
        postClickError = null;
      }
    } catch (err) {
      postClickError = err;
    }
  }

  if (postClickError !== null) {
    try {
      await humanClick(page, page.locator(LINKEDIN.selectors.composer.textEditorAria).first());
      await page.keyboard.press('Control+Enter');
      postClickError = null;
    } catch (err) {
      postClickError = err;
    }
  }

  if (postClickError !== null) {
    throw new Error(
      `Failed to click Post button via all three methods: ${postClickError instanceof Error ? postClickError.message : String(postClickError)}`,
    );
  }

  const toastPromise = waitForPublishedToast(page);
  toastPromise.catch(() => undefined);

  await page
    .locator(LINKEDIN.selectors.composer.modal)
    .waitFor({ state: 'hidden', timeout: longMs })
    .catch(() =>
      page
        .locator(LINKEDIN.selectors.composer.modalAria)
        .waitFor({ state: 'hidden', timeout: longMs }),
    )
    .catch(() => {
      throw new Error('Post may not have been published (composer modal did not close)');
    });

  return waitForPublishConfirmation(page, knownFeedUrns, clampedText, toastPromise);
}
