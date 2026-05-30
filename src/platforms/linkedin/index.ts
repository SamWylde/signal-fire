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

const log = createLogger('linkedin');
import { type LinkedInAuthInput, applyLinkedInAuth, isLoggedIn } from './auth.js';
import { type LinkedInComposeInput, createPost } from './compose.js';

export type { LinkedInComposeInput } from './compose.js';

export interface LinkedInPostOptions {
  accountId: AccountId;
  auth?: LinkedInAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
  sharedContext?: BrowserContext;
  submit?: boolean;
}

function isUnsurePublishConfirmation(message: string): boolean {
  return /post may not have been published|confirmation timeout|did not show the success dialog/i.test(
    message,
  );
}

export async function post(
  input: LinkedInComposeInput,
  options: LinkedInPostOptions,
): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;
  const submit = options.submit !== false;

  // 1. Rate-limit pre-check
  if (submit && rateLimits !== undefined) {
    const limitResult = await checkAllLimits('linkedin', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 2. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'linkedin',
  };

  await assertNotQuarantined('linkedin', accountId);

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
      const authResult = await applyLinkedInAuth(context, auth);
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
    let result: { postUrl?: string; status?: 'posted' | 'unsure'; detail?: string };
    const composeInput = submit ? input : { ...input, dryRun: true };
    try {
      result = await createPost(page, composeInput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = isUnsurePublishConfirmation(msg) ? 'unsure' : 'failed';
      const debugArtifacts = await captureFailureArtifacts('linkedin', page).catch(() => undefined);
      await recordAction('linkedin', accountId, 'post', {
        ok: false,
        meta: {
          hasImage: !!input.imagePath,
          target: input.target ?? (input.companyPageUrl !== undefined ? 'company' : 'profile'),
          status,
        },
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
        await markUserDataDirValidated('linkedin', accountId);
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
    await markUserDataDirValidated('linkedin', accountId);

    // 7. Record success
    const status = result.status ?? 'posted';
    const ok = status === 'posted';
    await recordAction('linkedin', accountId, 'post', {
      ok,
      meta: {
        hasImage: !!input.imagePath,
        target: input.target ?? (input.companyPageUrl !== undefined ? 'company' : 'profile'),
        status,
        ...(result.detail !== undefined && { detail: result.detail }),
      },
    });

    if (!ok) {
      return {
        ok: false,
        status,
        error: 'publish-confirmation-unknown',
        ...(result.detail !== undefined && { detail: result.detail }),
        ...(result.postUrl !== undefined && { url: result.postUrl }),
      };
    }

    return {
      ok: true,
      status,
      ...(result.postUrl !== undefined && { url: result.postUrl }),
      ...(result.detail !== undefined && { detail: result.detail }),
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
