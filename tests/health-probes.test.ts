// Safety tests for platform-level probeComposer functions.
//
// Each test builds a fake Page that records every method called and the selectors used,
// then verifies:
//   1. No mutating methods (fill, type, press, setInputFiles, click on submit-like selectors) are invoked.
//   2. When primary + secondary selectors are "visible", probeComposer returns composer 'ok'.
//   3. When a selector is NOT visible, it appears in missingSelectors and composer is 'drifted'.

import { describe, expect, it } from 'vitest';

import type { Page } from '../src/core/browser.js';
import { probeComposer as facebookProbe } from '../src/platforms/facebook/health.js';
import { probeComposer as instagramProbe } from '../src/platforms/instagram/health.js';
import { probeComposer as linkedinProbe } from '../src/platforms/linkedin/health.js';
import { probeComposer as tiktokProbe } from '../src/platforms/tiktok/health.js';
import { probeComposer as xProbe } from '../src/platforms/x/health.js';
import { probeComposer as youtubeProbe } from '../src/platforms/youtube/health.js';

// Known submit/publish button selectors per platform. Any click on these is forbidden.
// Using an explicit set (not a pattern) avoids false positives from trigger labels like
// "New post" or "Start a post" that are open-triggers, not submit buttons.
const KNOWN_SUBMIT_SELECTORS = new Set([
  // X
  '[data-testid="tweetButton"]',
  '[data-testid="tweetButtonInline"]',
  "//button[@data-testid='tweetButton']",
  "//button[@data-testid='tweetButtonInline']",
  // LinkedIn
  '.share-actions__primary-action',
  "button[aria-label='Post']",
  'button.share-actions__primary-action:has-text("Publish")',
  'button.artdeco-button--primary',
  // Facebook
  '[aria-label="Post"][role="button"]',
  // Instagram
  '[aria-label="Create new post"][role="dialog"] div[role="button"]:has-text("Share")',
  // YouTube
  '#done-button',
  "ytcp-button[aria-label='Done'], .done-button",
  // TikTok
  "//button[@data-e2e='post_video_button']",
  "//button[.//div[text()='Post now']]",
]);

/**
 * Build a fake Page that:
 *   - Accepts page.goto without doing anything.
 *   - Records every method call.
 *   - Makes locator(...).first().waitFor({state:'visible'}) resolve for selectors in `visibleSelectors`
 *     and reject for anything else.
 *   - Makes locator(...).first().waitFor({state:'attached'}) resolve for selectors in `attachedSelectors`.
 *   - Throws on any mutating method (fill, type, press, setInputFiles).
 *   - Records clicks; callers assert on recorded clicks afterward.
 */
interface FakePageOptions {
  visibleSelectors: string[];
  attachedSelectors?: string[];
}

interface MethodCall {
  method: string;
  args: unknown[];
}

interface FakePage {
  page: Page;
  calls: MethodCall[];
}

function makeFakePage(opts: FakePageOptions): FakePage {
  const { visibleSelectors, attachedSelectors = [] } = opts;
  const calls: MethodCall[] = [];

  function makeLocator(selector: string) {
    function makeLocatorObject() {
      return {
        first() {
          return {
            waitFor({ state, timeout: _timeout }: { state?: string; timeout?: number } = {}) {
              const effectiveState = state ?? 'visible';
              if (effectiveState === 'attached') {
                return attachedSelectors.includes(selector) || visibleSelectors.includes(selector)
                  ? Promise.resolve()
                  : Promise.reject(new Error(`Selector not attached: ${selector}`));
              }
              // state === 'visible' or anything else
              return visibleSelectors.includes(selector)
                ? Promise.resolve()
                : Promise.reject(new Error(`Selector not visible: ${selector}`));
            },
            click() {
              calls.push({ method: 'locator.first.click', args: [selector] });
              return Promise.resolve();
            },
          };
        },
        waitFor({ state, timeout: _timeout }: { state?: string; timeout?: number } = {}) {
          const effectiveState = state ?? 'visible';
          if (effectiveState === 'attached') {
            return attachedSelectors.includes(selector) || visibleSelectors.includes(selector)
              ? Promise.resolve()
              : Promise.reject(new Error(`Selector not attached: ${selector}`));
          }
          return visibleSelectors.includes(selector)
            ? Promise.resolve()
            : Promise.reject(new Error(`Selector not visible: ${selector}`));
        },
        click() {
          calls.push({ method: 'locator.click', args: [selector] });
          return Promise.resolve();
        },
        fill(value: string) {
          calls.push({ method: 'fill', args: [selector, value] });
          throw new Error(`FORBIDDEN: fill called on ${selector}`);
        },
        type(text: string) {
          calls.push({ method: 'type', args: [selector, text] });
          throw new Error(`FORBIDDEN: type called on ${selector}`);
        },
        press(key: string) {
          calls.push({ method: 'press', args: [selector, key] });
          throw new Error(`FORBIDDEN: press called on ${selector}`);
        },
        setInputFiles(files: unknown) {
          calls.push({ method: 'setInputFiles', args: [selector, files] });
          throw new Error(`FORBIDDEN: setInputFiles called on ${selector}`);
        },
      };
    }
    return makeLocatorObject();
  }

  const page = {
    goto(_url: string, _opts?: unknown) {
      return Promise.resolve(null);
    },
    locator(selector: string) {
      return makeLocator(selector);
    },
    url() {
      return '';
    },
    fill(selector: string, value: string) {
      calls.push({ method: 'fill', args: [selector, value] });
      throw new Error(`FORBIDDEN: page.fill called on ${selector}`);
    },
    type(selector: string, text: string) {
      calls.push({ method: 'type', args: [selector, text] });
      throw new Error(`FORBIDDEN: page.type called on ${selector}`);
    },
    press(selector: string, key: string) {
      calls.push({ method: 'press', args: [selector, key] });
      throw new Error(`FORBIDDEN: page.press called on ${selector}`);
    },
    setInputFiles(selector: string, files: unknown) {
      calls.push({ method: 'setInputFiles', args: [selector, files] });
      throw new Error(`FORBIDDEN: page.setInputFiles called on ${selector}`);
    },
    click(selector: string) {
      calls.push({ method: 'click', args: [selector] });
      return Promise.resolve();
    },
  } as unknown as Page;

  return { page, calls };
}

/** Assert no mutating calls happened. Allowed: locator clicks on open-trigger selectors. */
function assertNoMutatingCalls(calls: MethodCall[]): void {
  for (const call of calls) {
    // Direct fill/type/press/setInputFiles are always forbidden
    expect(['fill', 'type', 'press', 'setInputFiles']).not.toContain(call.method);

    // Any click (page.click, locator.click, locator.first.click) on a known submit selector is forbidden
    if (
      (call.method === 'click' ||
        call.method === 'locator.click' ||
        call.method === 'locator.first.click') &&
      typeof call.args[0] === 'string'
    ) {
      const sel = call.args[0];
      expect(
        KNOWN_SUBMIT_SELECTORS.has(sel),
        `Forbidden click on known submit selector: ${sel}`,
      ).toBe(false);
    }
  }
}

// ─── X ────────────────────────────────────────────────────────────────────────

describe('X probeComposer', () => {
  // The actual selector strings used by the health probe (from src/platforms/x/selectors.ts)
  const textEditor = '[data-testid="tweetTextarea_0"]';
  const postButton = '[data-testid="tweetButton"]';

  it('returns composer ok and no missingSelectors when all selectors are visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [textEditor, postButton],
    });

    const result = await xProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    expect(result.checkedSelectors).toHaveLength(2);
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted and lists missing selector when postButton is not visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [textEditor], // postButton is NOT visible
    });

    const result = await xProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('composer.postButton');
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted and lists both selectors when nothing is visible', async () => {
    const { page, calls } = makeFakePage({ visibleSelectors: [] });

    const result = await xProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('composer.textEditor');
    expect(result.missingSelectors).toContain('composer.postButton');
    assertNoMutatingCalls(calls);
  });

  it('never calls fill, type, press, or setInputFiles', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [textEditor, postButton],
    });

    await xProbe(page);

    const mutatingMethods = calls.filter((c) =>
      ['fill', 'type', 'press', 'setInputFiles'].includes(c.method),
    );
    expect(mutatingMethods).toHaveLength(0);
  });
});

// ─── TikTok ───────────────────────────────────────────────────────────────────

describe('TikTok probeComposer', () => {
  // TikTok uses xpath= prefixed selectors
  const uploadVideo = `xpath=//input[@type='file']`;
  const description = `xpath=//div[@contenteditable='true']`;

  it('returns composer ok when all selectors are visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [uploadVideo, description],
    });

    const result = await tiktokProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when file input is attached but hidden', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [description],
      attachedSelectors: [uploadVideo],
    });

    const result = await tiktokProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted and lists missing when description is not visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [uploadVideo], // description not visible
    });

    const result = await tiktokProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('upload.description');
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted when no selectors are visible', async () => {
    const { page, calls } = makeFakePage({ visibleSelectors: [] });

    const result = await tiktokProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('upload.uploadVideo');
    expect(result.missingSelectors).toContain('upload.description');
    assertNoMutatingCalls(calls);
  });

  it('never calls fill, type, press, or setInputFiles', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [uploadVideo, description],
    });

    await tiktokProbe(page);

    const mutatingMethods = calls.filter((c) =>
      ['fill', 'type', 'press', 'setInputFiles'].includes(c.method),
    );
    expect(mutatingMethods).toHaveLength(0);
  });
});

// ─── Facebook ─────────────────────────────────────────────────────────────────

describe('Facebook probeComposer', () => {
  // Facebook clicks a trigger then checks for modal + textEditor
  const inlinePlaceholder = 'div[role="button"]:has-text("What\'s on your mind")';
  const createPostTrigger = "div[role='button']:has-text('Create post')";
  const modal = '[aria-label="Create post"][role="dialog"][aria-modal="true"]';
  const modalOuter = '[role="dialog"][aria-modal="true"]';
  const textEditor =
    '[role="dialog"][aria-modal="true"] div[contenteditable="true"][data-lexical-editor="true"][role="textbox"]';

  it('returns composer ok when modal and textEditor are visible (trigger present)', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [inlinePlaceholder, modal, textEditor],
    });

    const result = await facebookProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok through create-post trigger and modal fallback', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [createPostTrigger, modalOuter, textEditor],
    });

    const result = await facebookProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when modal and textEditor are visible (trigger absent — click is best-effort)', async () => {
    // Trigger not in visible — .catch(() => undefined) swallows the error
    const { page, calls } = makeFakePage({
      visibleSelectors: [modal, textEditor],
    });

    const result = await facebookProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted and lists missing selectors when modal is absent', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [inlinePlaceholder], // modal and textEditor not visible
    });

    const result = await facebookProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('composer.modal');
    assertNoMutatingCalls(calls);
  });

  it('the trigger click is on an open-trigger selector, not a submit selector', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [inlinePlaceholder, modal, textEditor],
    });

    await facebookProbe(page);

    // The only allowed click is on inlinePlaceholder (the open trigger)
    const clicks = calls.filter(
      (c) => c.method === 'locator.first.click' || c.method === 'locator.click',
    );
    for (const click of clicks) {
      const sel = String(click.args[0]);
      expect(KNOWN_SUBMIT_SELECTORS.has(sel), `Submit button was clicked: ${sel}`).toBe(false);
    }
  });
});

// ─── Instagram ────────────────────────────────────────────────────────────────

describe('Instagram probeComposer', () => {
  const newPostTrigger = 'a[aria-label="New post"]';
  const createModal = '[aria-label="Create new post"][aria-modal="true"][role="dialog"]';
  const fileInput = '[aria-label="Create new post"][role="dialog"] input[type="file"]';
  const postMenuItem =
    "xpath=//*[@role='menuitem' or @role='button' or @role='link' or self::a][normalize-space()='Post' or .//*[normalize-space()='Post']]";

  it('returns composer ok when createModal and fileInput are visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [newPostTrigger, createModal, fileInput],
    });

    const result = await instagramProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when file input is attached but hidden', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [newPostTrigger, createModal],
      attachedSelectors: [fileInput],
    });

    const result = await instagramProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('clicks the intermediate Post menu item when present before checking the modal', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [newPostTrigger, postMenuItem, createModal],
      attachedSelectors: [fileInput],
    });

    const result = await instagramProbe(page);

    expect(result.composer).toBe('ok');
    expect(
      calls.some((call) => call.method === 'locator.first.click' && call.args[0] === postMenuItem),
    ).toBe(true);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when trigger absent (best-effort click) but modal visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [createModal, fileInput],
    });

    const result = await instagramProbe(page);

    expect(result.composer).toBe('ok');
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted when fileInput is not visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [newPostTrigger, createModal], // fileInput not visible
    });

    const result = await instagramProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('composer.fileInput');
    assertNoMutatingCalls(calls);
  });

  it('never calls setInputFiles (file input is only reachability-checked, never used)', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [newPostTrigger, createModal, fileInput],
    });

    await instagramProbe(page);

    const setInputFilesCalls = calls.filter((c) => c.method === 'setInputFiles');
    expect(setInputFilesCalls).toHaveLength(0);
  });
});

// ─── LinkedIn ─────────────────────────────────────────────────────────────────

describe('LinkedIn probeComposer', () => {
  const startPostTrigger = 'div[role="button"]:has(> [aria-label="Start a post"])';
  const companyStartPostTrigger =
    "button[aria-label='Start a post'], button[aria-label='Create a post'], button:has-text('Start a post'), button:has-text('Create a post')";
  const modal = '.share-box';
  const modalAria = "div[role='dialog']";
  const textEditor = '.editor-content';
  const textEditorAria = "div[role='textbox']";

  it('returns composer ok when modal and textEditor are visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [startPostTrigger, modal, textEditor],
    });

    const result = await linkedinProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok through company/modal aria fallbacks', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [companyStartPostTrigger, modalAria, textEditorAria],
    });

    const result = await linkedinProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when trigger absent (best-effort) but modal visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [modal, textEditor],
    });

    const result = await linkedinProbe(page);

    expect(result.composer).toBe('ok');
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted when textEditor is not visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [startPostTrigger, modal],
    });

    const result = await linkedinProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('composer.textEditor');
    assertNoMutatingCalls(calls);
  });

  it('the trigger click is on an open-trigger selector, not the share-actions submit button', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [startPostTrigger, modal, textEditor],
    });

    await linkedinProbe(page);

    const clicks = calls.filter(
      (c) => c.method === 'locator.first.click' || c.method === 'locator.click',
    );
    for (const click of clicks) {
      const sel = String(click.args[0]);
      // The Post submit button (.share-actions__primary-action) must never be clicked
      expect(sel).not.toMatch(/share-actions__primary-action/);
    }
  });
});

// ─── YouTube ──────────────────────────────────────────────────────────────────

describe('YouTube probeComposer', () => {
  const dialog = 'ytcp-uploads-dialog';
  const fileInput = "ytcp-uploads-dialog input[type='file']:not(#file-loader)";
  const createButton =
    "ytcp-button#create-icon, button[aria-label='Create'], ytcp-button[aria-label='Create']";
  const uploadVideosMenuItem =
    "tp-yt-paper-item[test-id='upload-beta'], ytcp-ve[command='UPLOAD_VIDEO'], [role='menuitem']:has-text('Upload videos')";

  it('returns composer ok when dialog already open (dialog is attached)', async () => {
    // When dialog is attached right away, the code skips the create-button click path.
    const { page, calls } = makeFakePage({
      visibleSelectors: [dialog, fileInput],
      attachedSelectors: [dialog], // dialog already present
    });

    const result = await youtubeProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when file input is attached but hidden', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [dialog],
      attachedSelectors: [dialog, fileInput],
    });

    const result = await youtubeProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer ok when dialog opened via Create button click path', async () => {
    // Dialog is NOT attached initially → code clicks createButton then uploadVideosMenuItem
    const { page, calls } = makeFakePage({
      visibleSelectors: [createButton, uploadVideosMenuItem, dialog, fileInput],
      attachedSelectors: [], // dialog not yet attached
    });

    const result = await youtubeProbe(page);

    expect(result.composer).toBe('ok');
    expect(result.missingSelectors).toEqual([]);
    assertNoMutatingCalls(calls);
  });

  it('returns composer drifted when fileInput is not visible', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [dialog], // fileInput not visible
      attachedSelectors: [dialog],
    });

    const result = await youtubeProbe(page);

    expect(result.composer).toBe('drifted');
    expect(result.missingSelectors).toContain('upload.fileInput');
    assertNoMutatingCalls(calls);
  });

  it('never calls setInputFiles (file input is only reachability-checked, never used)', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [dialog, fileInput],
      attachedSelectors: [dialog],
    });

    await youtubeProbe(page);

    const setInputFilesCalls = calls.filter((c) => c.method === 'setInputFiles');
    expect(setInputFilesCalls).toHaveLength(0);
  });

  it('the Create button and Upload videos clicks are on non-submit selectors', async () => {
    const { page, calls } = makeFakePage({
      visibleSelectors: [createButton, uploadVideosMenuItem, dialog, fileInput],
      attachedSelectors: [],
    });

    await youtubeProbe(page);

    // Verify no click is on a "done/publish" selector
    const clicks = calls.filter(
      (c) => c.method === 'locator.first.click' || c.method === 'locator.click',
    );
    for (const click of clicks) {
      const sel = String(click.args[0]);
      expect(sel).not.toMatch(/done-button|#done-button/);
    }
  });
});
