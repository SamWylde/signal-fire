import { type LaunchOptions, launchBrowser } from '../../core/browser.js';
import { captureFailureArtifacts } from '../../core/debug-artifacts.js';
import { recordAction } from '../../core/ledger.js';
import { type ActionLimits, checkAllLimits } from '../../core/rate-limiter.js';
import { markUserDataDirValidated } from '../../core/session.js';
import type { AccountId, PostResult } from '../../core/types.js';
import { type InstagramAuthInput, applyInstagramAuth, isLoggedIn } from './auth.js';
import { type InstagramComposeInput, createPost } from './composer.js';

export type { InstagramComposeInput } from './composer.js';

export interface InstagramPostOptions {
  accountId: AccountId;
  auth?: InstagramAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
}

export async function post(
  input: InstagramComposeInput,
  options: InstagramPostOptions,
): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;

  // 1. Rate-limit pre-check
  if (rateLimits !== undefined) {
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

  const { context, close } = await launchBrowser(mergedLaunchOptions);
  try {
    // 3. Apply auth if provided
    if (auth !== undefined) {
      const authResult = await applyInstagramAuth(context, auth);
      if (!authResult.ok) {
        return { ok: false, error: `auth:${authResult.reason ?? 'unknown'}` };
      }
    }

    // 4. Verify login
    const page = context.pages()[0] ?? (await context.newPage());
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      return { ok: false, error: 'not-logged-in' };
    }

    // 5. Create post
    try {
      await createPost(page, input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('instagram', page).catch(
        () => undefined,
      );
      await recordAction('instagram', accountId, 'post', {
        ok: false,
        meta: { hasImage: true, captionLength: input.caption?.length ?? 0 },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    // 6. Mark persistent session as validated
    await markUserDataDirValidated('instagram', accountId);

    // 7. Record success
    await recordAction('instagram', accountId, 'post', {
      ok: true,
      meta: { hasImage: true, captionLength: input.caption?.length ?? 0 },
    });

    return { ok: true };
  } finally {
    await close();
  }
}
