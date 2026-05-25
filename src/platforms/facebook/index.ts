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
import { type FacebookAuthInput, applyFacebookAuth, isLoggedIn } from './auth.js';
import { type FacebookComposeInput, type FacebookComposeResult, createPost } from './compose.js';

export type { FacebookComposeInput } from './compose.js';

export interface FacebookPostOptions {
  accountId: AccountId;
  auth?: FacebookAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
  sharedContext?: BrowserContext;
  submit?: boolean;
}

export async function post(
  input: FacebookComposeInput,
  options: FacebookPostOptions,
): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;
  const submit = options.submit !== false;

  // 1. Rate-limit pre-check
  if (submit && rateLimits !== undefined) {
    const limitResult = await checkAllLimits('facebook', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 2. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'facebook',
  };

  await assertNotQuarantined('facebook', accountId);

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
      const authResult = await applyFacebookAuth(context, auth);
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
    let composeResult: FacebookComposeResult | undefined;
    const composeInput = submit ? input : { ...input, dryRun: true };
    try {
      composeResult = await createPost(page, composeInput);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('facebook', page).catch(() => undefined);
      await recordAction('facebook', accountId, 'post', {
        ok: false,
        meta: { hasImage: !!input.imagePath, pageUrl: input.pageUrl },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    if (!submit) {
      try {
        await markUserDataDirValidated('facebook', accountId);
      } catch (err) {
        console.error('Failed to mark session validated:', err);
      }
      keepOpen = true;
      return {
        ok: true,
        status: 'prepared',
        detail: 'Form filled - submit manually in browser tab',
      };
    }

    // 6. Mark persistent session as validated
    await markUserDataDirValidated('facebook', accountId);

    // 7. Record success
    await recordAction('facebook', accountId, 'post', {
      ok: true,
      meta: {
        hasImage: !!input.imagePath,
        pageUrl: input.pageUrl,
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
