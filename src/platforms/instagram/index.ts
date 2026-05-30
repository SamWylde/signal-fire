import {
  type BrowserContext,
  type LaunchOptions,
  type Page,
  assertNotQuarantined,
  launchBrowser,
} from '../../core/browser.js';
import { captureFailureArtifacts } from '../../core/debug-artifacts.js';
import { recordAction } from '../../core/ledger.js';
import { createLogger } from '../../core/logging.js';
import { type ActionLimits, checkAllLimits } from '../../core/rate-limiter.js';
import { markUserDataDirValidated } from '../../core/session.js';
import type { AccountId, PostResult } from '../../core/types.js';

const log = createLogger('instagram');
import { type InstagramAuthInput, applyInstagramAuth, isLoggedIn } from './auth.js';
import { type InstagramComposeInput, type InstagramComposeResult, createPost } from './composer.js';

export type { InstagramComposeInput } from './composer.js';

export interface InstagramPostOptions {
  accountId: AccountId;
  auth?: InstagramAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
  sharedContext?: BrowserContext;
  submit?: boolean;
}

function isUnsurePublishConfirmation(message: string): boolean {
  return /post may not have been published|no share confirmation/i.test(message);
}

export async function post(
  input: InstagramComposeInput,
  options: InstagramPostOptions,
): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;
  const submit = options.submit !== false;

  // 1. Rate-limit pre-check
  if (submit && rateLimits !== undefined) {
    const limitResult = await checkAllLimits('instagram', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 2. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'instagram',
  };

  await assertNotQuarantined('instagram', accountId);

  const sharedContext = options.sharedContext;
  let context: BrowserContext;
  let ownedClose: (() => Promise<void>) | null = null;
  let ownedPage: Page | null = null;
  let keepOpen = false;

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
    // 3. Apply auth if provided
    if (auth !== undefined) {
      const authResult = await applyInstagramAuth(context, auth);
      if (!authResult.ok) {
        return { ok: false, error: `auth:${authResult.reason ?? 'unknown'}` };
      }
    }

    // 4. Verify login
    const page = ownedPage ?? context.pages()[0] ?? (await context.newPage());
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      return { ok: false, error: 'not-logged-in' };
    }

    // 5. Create post
    let composeResult: InstagramComposeResult | undefined;
    const composeInput = submit ? input : { ...input, dryRun: true };
    try {
      composeResult = await createPost(page, composeInput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = isUnsurePublishConfirmation(msg) ? 'unsure' : 'failed';
      const debugArtifacts = await captureFailureArtifacts('instagram', page).catch(
        () => undefined,
      );
      await recordAction('instagram', accountId, 'post', {
        ok: false,
        meta: { hasImage: true, captionLength: input.caption?.length ?? 0, status },
      });
      return {
        ok: false,
        status,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    if (!submit) {
      try {
        await markUserDataDirValidated('instagram', accountId);
      } catch (err) {
        log.error('Failed to mark session validated:', err);
      }
      keepOpen = true;
      return {
        ok: true,
        status: 'prepared',
        detail: 'Form filled - submit manually in browser tab',
      };
    }

    // 6. Mark persistent session as validated
    await markUserDataDirValidated('instagram', accountId);

    // 7. Record success
    await recordAction('instagram', accountId, 'post', {
      ok: true,
      meta: {
        hasImage: true,
        captionLength: input.caption?.length ?? 0,
        status: composeResult?.status,
        detail: composeResult?.detail,
      },
    });

    return {
      ok: true,
      ...(composeResult?.status !== undefined && { status: composeResult.status }),
      ...(composeResult?.detail !== undefined && { detail: composeResult.detail }),
    };
  } finally {
    if (ownedClose && !keepOpen) {
      try {
        await ownedClose();
      } catch {}
    }
    // When using a shared context, leave the platform's tab open so the user
    // can inspect it after the campaign. The browser stays alive (per the
    // current testing setup) and all tabs accumulate.
  }
}
