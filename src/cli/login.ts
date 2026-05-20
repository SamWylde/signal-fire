import * as readline from 'node:readline';

import { type Page, launchBrowser } from '../core/browser.js';
import { getSessionPaths, markUserDataDirValidated } from '../core/session.js';
import type { Platform } from '../core/types.js';
import { parseFlags } from './flags.js';

const LOGIN_URLS: Record<Platform, string> = {
  tiktok: 'https://www.tiktok.com/login',
  x: 'https://x.com/i/flow/login',
  facebook: 'https://www.facebook.com/login',
  linkedin: 'https://www.linkedin.com/login',
  youtube: 'https://accounts.google.com/signin',
  instagram: 'https://www.instagram.com/accounts/login',
  pinterest: 'https://www.pinterest.com/login',
  reddit: 'https://www.reddit.com/login',
  threads: 'https://www.threads.net/login',
};

const LOGIN_PLATFORMS: Platform[] = ['tiktok', 'x', 'facebook', 'linkedin', 'youtube', 'instagram'];

export async function runLogin(argv: string[]): Promise<void> {
  let flags: ReturnType<typeof parseFlags>;
  try {
    flags = parseFlags(argv, [
      { name: 'platform', type: 'string' },
      { name: 'account', type: 'string' },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }

  if (flags.help === true) {
    process.stdout.write(
      `signal-fire login --platform <p> --account <id>\n\nPlatforms: ${LOGIN_PLATFORMS.join(', ')}\n`,
    );
    return;
  }

  const platform = typeof flags.platform === 'string' ? flags.platform : undefined;
  const accountId = typeof flags.account === 'string' ? flags.account : undefined;

  if (platform === undefined) {
    process.stderr.write('error: --platform is required\n');
    process.exit(1);
  }
  if (!LOGIN_PLATFORMS.includes(platform as Platform)) {
    process.stderr.write(
      `error: unknown platform "${platform}". Valid: ${LOGIN_PLATFORMS.join(', ')}\n`,
    );
    process.exit(1);
  }
  if (accountId === undefined) {
    process.stderr.write('error: --account is required\n');
    process.exit(1);
  }

  const loginUrl = LOGIN_URLS[platform as Platform];

  const typedPlatform = platform as Platform;
  const { context, close } = await launchBrowser({
    accountId,
    platform: typedPlatform,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(loginUrl);

    process.stdout.write(
      `Opened browser at ${loginUrl}. Log in manually, then press ENTER in this terminal to verify and save the session.\n`,
    );

    await new Promise<void>((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question('Press ENTER when logged in: ', () => {
        rl.close();
        resolve();
      });
    });

    const authModule = (await import(`../platforms/${platform}/auth.js`)) as {
      isLoggedIn?: (page: Page) => Promise<boolean>;
    };
    const loggedIn = await authModule.isLoggedIn?.(page);
    if (loggedIn !== true) {
      throw new Error(
        `Could not verify a logged-in ${platform} session. Finish login in the browser, then run the login command again.`,
      );
    }

    await markUserDataDirValidated(typedPlatform, accountId);

    const paths = getSessionPaths(typedPlatform, accountId);
    process.stdout.write(`Saved persistent browser profile to ${paths.userDataDir}\n`);
  } finally {
    await close();
  }
}
