import {
  type BrowserContext,
  type LaunchOptions,
  type Page,
  assertNotQuarantined,
  launchBrowser,
} from '../../core/browser.js';
import { captureFailureArtifacts } from '../../core/debug-artifacts.js';
import { recordAction } from '../../core/ledger.js';
import { type ActionLimits, checkAllLimits } from '../../core/rate-limiter.js';
import { markUserDataDirValidated } from '../../core/session.js';
import type { AccountId, PostResult } from '../../core/types.js';
import { type YouTubeAuthInput, applyYouTubeAuth, isLoggedIn } from './auth.js';
import { type YouTubeUploadInput, completeUpload, validateSchedule } from './upload.js';

export type { YouTubeUploadInput, YouTubeScheduleInput, Visibility } from './upload.js';

export interface YouTubePostOptions {
  accountId: AccountId;
  auth?: YouTubeAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
  sharedContext?: BrowserContext;
  submit?: boolean;
}

export async function post(
  input: YouTubeUploadInput,
  options: YouTubePostOptions,
): Promise<PostResult> {
  if (options.submit === false) {
    return {
      ok: false,
      error: 'manual-prepare-unsupported',
      detail: 'YouTube uses upload flow; prepare mode is not supported',
    };
  }

  const { accountId, auth, launchOptions, rateLimits } = options;

  // 1. Validate schedule before doing anything async
  if (input.schedule !== undefined) {
    validateSchedule(input.schedule.at);
  }

  // 2. Rate-limit pre-check
  if (rateLimits !== undefined) {
    const limitResult = await checkAllLimits('youtube', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 3. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'youtube',
  };

  await assertNotQuarantined('youtube', accountId);

  const sharedContext = options.sharedContext;
  let context: BrowserContext;
  let ownedClose: (() => Promise<void>) | null = null;
  let ownedPage: Page | null = null;

  if (sharedContext) {
    context = sharedContext;
    // Reuse an existing about:blank tab if there is one (so we don't leave the
    // browser's initial blank tab orphaned next to the new platform tab).
    const blank = context.pages().find((p) => {
      const u = p.url();
      return u === 'about:blank' || u === '';
    });
    ownedPage = blank ?? (await context.newPage());
  } else {
    const launched = await launchBrowser(mergedLaunchOptions);
    context = launched.context;
    ownedClose = launched.close;
  }

  try {
    // 4. Apply auth if provided
    if (auth !== undefined) {
      const authResult = await applyYouTubeAuth(context, auth);
      if (!authResult.ok) {
        return { ok: false, error: `auth:${authResult.reason ?? 'unknown'}` };
      }
    }

    // 5. Verify login
    const page = ownedPage ?? context.pages()[0] ?? (await context.newPage());
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      return { ok: false, error: 'not-logged-in' };
    }

    // 6. Upload
    let result: { videoUrl?: string };
    try {
      result = await completeUpload(page, input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('youtube', page).catch(() => undefined);
      await recordAction('youtube', accountId, 'post', {
        ok: false,
        meta: {
          hasSchedule: input.schedule !== undefined,
          visibility: input.visibility ?? 'private',
          hasPlaylist: input.playlist !== undefined,
          hasThumbnail: input.thumbnailPath !== undefined,
        },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    // 7. Mark persistent session as validated
    await markUserDataDirValidated('youtube', accountId);

    // 8. Record success
    await recordAction('youtube', accountId, 'post', {
      ok: true,
      meta: {
        hasSchedule: input.schedule !== undefined,
        visibility: input.visibility ?? 'private',
        hasPlaylist: input.playlist !== undefined,
        hasThumbnail: input.thumbnailPath !== undefined,
      },
    });

    return result.videoUrl !== undefined ? { ok: true, url: result.videoUrl } : { ok: true };
  } finally {
    if (ownedClose) {
      try {
        await ownedClose();
      } catch {}
    }
    // When using a shared context, leave the platform's tab open so the user
    // can inspect it after the campaign. The browser stays alive (per the
    // current testing setup) and all tabs accumulate.
  }
}
