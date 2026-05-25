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
import { type TikTokAuthInput, applyTikTokAuth, isLoggedIn } from './auth.js';
import {
  type UploadInput,
  completeUploadForm,
  normalizeSchedule,
  validateSchedule,
} from './upload.js';

export type { Visibility, ScheduleInput, UploadInput } from './upload.js';

export interface TikTokPostOptions {
  accountId: AccountId;
  auth?: TikTokAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
  sharedContext?: BrowserContext;
  submit?: boolean;
}

/**
 * Top-level entry point for posting a TikTok video.
 * Validates schedule (if present), checks rate limits, launches a stealth context,
 * loads session, applies auth (if provided), confirms login, runs the upload,
 * records the action, saves session, and returns a result.
 */
export async function post(input: UploadInput, options: TikTokPostOptions): Promise<PostResult> {
  if (options.submit === false) {
    return {
      ok: false,
      error: 'manual-prepare-unsupported',
      detail: 'TikTok uses upload flow; prepare mode is not supported',
    };
  }

  const { accountId, auth, launchOptions, rateLimits } = options;

  // 1. Validate schedule before doing anything async
  if (input.schedule !== undefined) {
    validateSchedule(normalizeSchedule(input.schedule.at));
  }

  // 2. Rate-limit pre-check
  if (rateLimits !== undefined) {
    const limitResult = await checkAllLimits('tiktok', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 3. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'tiktok',
  };

  await assertNotQuarantined('tiktok', accountId);

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
      const authResult = await applyTikTokAuth(context, auth);
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
    try {
      await completeUploadForm(page, input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('tiktok', page).catch(() => undefined);
      await recordAction('tiktok', accountId, 'post', {
        ok: false,
        meta: { hasMedia: true, hasSchedule: input.schedule !== undefined },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    // 7. Mark persistent session as validated
    await markUserDataDirValidated('tiktok', accountId);

    // 8. Record success
    await recordAction('tiktok', accountId, 'post', {
      ok: true,
      meta: { hasMedia: true, hasSchedule: input.schedule !== undefined },
    });

    return { ok: true };
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
