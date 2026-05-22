import { type LaunchOptions, launchBrowser } from '../../core/browser.js';
import { captureFailureArtifacts } from '../../core/debug-artifacts.js';
import { recordAction } from '../../core/ledger.js';
import { type ActionLimits, checkAllLimits } from '../../core/rate-limiter.js';
import { markUserDataDirValidated } from '../../core/session.js';
import type { AccountId, PostResult } from '../../core/types.js';
import { type LinkedInAuthInput, applyLinkedInAuth, isLoggedIn } from './auth.js';
import { type LinkedInComposeInput, createPost } from './compose.js';

export type { LinkedInComposeInput } from './compose.js';

export interface LinkedInPostOptions {
  accountId: AccountId;
  auth?: LinkedInAuthInput;
  launchOptions?: Partial<LaunchOptions>;
  rateLimits?: ActionLimits;
}

export async function post(
  input: LinkedInComposeInput,
  options: LinkedInPostOptions,
): Promise<PostResult> {
  const { accountId, auth, launchOptions, rateLimits } = options;

  // 1. Rate-limit pre-check
  if (rateLimits !== undefined) {
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

  const { context, close } = await launchBrowser(mergedLaunchOptions);
  let succeeded = false;
  try {
    // 3. Apply auth if provided
    if (auth !== undefined) {
      const authResult = await applyLinkedInAuth(context, auth);
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
    let result: { postUrl?: string };
    try {
      result = await createPost(page, input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const debugArtifacts = await captureFailureArtifacts('linkedin', page).catch(() => undefined);
      await recordAction('linkedin', accountId, 'post', {
        ok: false,
        meta: {
          hasImage: !!input.imagePath,
          target: input.target ?? (input.companyPageUrl !== undefined ? 'company' : 'profile'),
        },
      });
      return {
        ok: false,
        error: msg,
        ...(debugArtifacts !== undefined && { debugArtifacts }),
      };
    }

    // 6. Mark persistent session as validated
    await markUserDataDirValidated('linkedin', accountId);

    // 7. Record success
    await recordAction('linkedin', accountId, 'post', {
      ok: true,
      meta: {
        hasImage: !!input.imagePath,
        target: input.target ?? (input.companyPageUrl !== undefined ? 'company' : 'profile'),
      },
    });

    succeeded = true;
    return result.postUrl !== undefined ? { ok: true, url: result.postUrl } : { ok: true };
  } finally {
    if (!succeeded) await close();
  }
}
