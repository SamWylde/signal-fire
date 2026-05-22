import { type LaunchOptions, launchBrowser } from '../../core/browser.js';
import { captureFailureArtifacts } from '../../core/debug-artifacts.js';
import { recordAction } from '../../core/ledger.js';
import { type ActionLimits, checkAllLimits } from '../../core/rate-limiter.js';
import { markUserDataDirValidated } from '../../core/session.js';
import type { AccountId, PostResult } from '../../core/types.js';
import { type XAuthInput, applyXAuth, isLoggedIn } from './auth.js';
import { type XComposeInput, postTweet } from './compose.js';

export type { ComposeMode, XComposeInput } from './compose.js';

export interface XPostOptions {
  accountId: AccountId;
  auth?: XAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
}

export async function post(input: XComposeInput, options: XPostOptions): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;

  // 1. Rate-limit pre-check
  if (rateLimits !== undefined) {
    const limitResult = await checkAllLimits('x', accountId, rateLimits, 'post');
    if (!limitResult.withinLimits) {
      return { ok: false, error: `rate-limit:${limitResult.breachedWindow ?? 'unknown'}` };
    }
  }

  // 2. Launch the account's persistent profile
  const mergedLaunchOptions: LaunchOptions = {
    ...(launchOptions ?? {}),
    accountId,
    platform: 'x',
  };

  const { context, close } = await launchBrowser(mergedLaunchOptions);
  let succeeded = false;
  try {
    // 3. Apply auth if provided
    if (auth !== undefined) {
      const authResult = await applyXAuth(context, auth);
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

    // 5. Post tweet
    let tweetUrl: string | undefined;
    try {
      const tweet = await postTweet(page, input);
      tweetUrl = tweet.tweetUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('x', page).catch(() => undefined);
      await recordAction('x', accountId, 'post', {
        ok: false,
        meta: { hasMedia: !!input.mediaPaths?.length },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    // 6. Mark persistent session as validated
    await markUserDataDirValidated('x', accountId);

    // 7. Record success
    await recordAction('x', accountId, 'post', {
      ok: true,
      meta: { hasMedia: !!input.mediaPaths?.length },
    });

    succeeded = true;
    return tweetUrl !== undefined ? { ok: true, url: tweetUrl } : { ok: true };
  } finally {
    if (!succeeded) await close();
  }
}
