import * as fs from 'node:fs/promises';

import type { Platform } from '../core/types.js';
import { type FlagSpec, type Flags, parseFlags } from './flags.js';

// ---------------------------------------------------------------------------
// Per-platform flag definitions
// ---------------------------------------------------------------------------

const COMMON_FLAGS: FlagSpec[] = [
  { name: 'platform', type: 'string' },
  { name: 'account', type: 'string' },
  { name: 'cookies-file', type: 'string' },
  { name: 'headed', type: 'boolean' },
];

const PLATFORM_SPECIFIC: Record<Platform, FlagSpec[]> = {
  tiktok: [
    { name: 'video', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'cover', type: 'string' },
    { name: 'product-id', type: 'string' },
    { name: 'visibility', type: 'string' },
    { name: 'schedule', type: 'string' },
    { name: 'no-comments', type: 'boolean' },
    { name: 'no-duet', type: 'boolean' },
    { name: 'no-stitch', type: 'boolean' },
  ],
  x: [
    { name: 'text', type: 'string' },
    { name: 'media', type: 'array' },
    { name: 'community-name', type: 'string' },
    { name: 'community-id', type: 'string' },
  ],
  facebook: [
    { name: 'page-url', type: 'string' },
    { name: 'text', type: 'string' },
    { name: 'image', type: 'string' },
  ],
  linkedin: [
    { name: 'text', type: 'string' },
    { name: 'image', type: 'string' },
    { name: 'target', type: 'string' },
    { name: 'company-page-url', type: 'string' },
  ],
  youtube: [
    { name: 'video', type: 'string' },
    { name: 'thumbnail', type: 'string' },
    { name: 'title', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'tags', type: 'array' },
    { name: 'playlist', type: 'string' },
    { name: 'made-for-kids', type: 'boolean' },
    { name: 'visibility', type: 'string' },
    { name: 'schedule', type: 'string' },
  ],
  instagram: [
    { name: 'image', type: 'string' },
    { name: 'caption', type: 'string' },
  ],
  // Unimplemented platforms — no specific flags yet
  pinterest: [],
  reddit: [],
  threads: [],
};

// ---------------------------------------------------------------------------
// Per-platform usage strings
// ---------------------------------------------------------------------------

const PLATFORM_USAGE: Record<Platform, string> = {
  tiktok: `signal-fire post --platform tiktok --account <id> --video <path> --description <text>
    [--cover <path>] [--product-id <id>] [--visibility everyone|friends|only_you]
    [--schedule <ISO-date>] [--no-comments] [--no-duet] [--no-stitch]
    [--cookies-file <path>]`,
  x: `signal-fire post --platform x --account <id> --text <text>
    [--media <path> [--media <path>...]] [--community-name <name>] [--community-id <id>]
    [--cookies-file <path>]`,
  facebook: `signal-fire post --platform facebook --account <id> --page-url <url> --text <text>
    [--image <path>] [--cookies-file <path>]`,
  linkedin: `signal-fire post --platform linkedin --account <id> --text <text>
    [--image <path>] [--target profile|company] [--company-page-url <url>]
    [--cookies-file <path>]`,
  youtube: `signal-fire post --platform youtube --account <id> --video <path> --title <title>
    [--thumbnail <path>] [--description <text>] [--tags <tag> [--tags <tag>...]] [--playlist <name>]
    [--made-for-kids] [--visibility public|unlisted|private]
    [--schedule <ISO-date>] [--cookies-file <path>]`,
  instagram: `signal-fire post --platform instagram --account <id> --image <path>
    [--caption <text>] [--cookies-file <path>]`,
  pinterest: 'signal-fire post --platform pinterest --account <id>  (not yet implemented)',
  reddit: 'signal-fire post --platform reddit --account <id>  (not yet implemented)',
  threads: 'signal-fire post --platform threads --account <id>  (not yet implemented)',
};

const VALID_PLATFORMS: Platform[] = ['tiktok', 'x', 'facebook', 'linkedin', 'youtube', 'instagram'];

const UNIMPLEMENTED_CLI_PLATFORMS = new Set<Platform>(['pinterest', 'reddit', 'threads']);
const TIKTOK_VISIBILITIES = ['everyone', 'friends', 'only_you'] as const;
const YOUTUBE_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
const LINKEDIN_TARGETS = ['profile', 'company'] as const;

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

function bool(flags: Flags, key: string): boolean {
  return flags[key] === true;
}

function arr(flags: Flags, key: string): string[] {
  const v = flags[key];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  return [];
}

function parseDateFlag(raw: string | undefined, flagName: string): Date | undefined {
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    process.stderr.write(`error: --${flagName} must be a valid date or ISO timestamp\n`);
    process.exit(1);
  }
  return date;
}

function parseChoice<const T extends readonly string[]>(
  raw: string | undefined,
  flagName: string,
  choices: T,
): T[number] | undefined {
  if (raw === undefined) return undefined;
  if ((choices as readonly string[]).includes(raw)) return raw as T[number];
  process.stderr.write(`error: --${flagName} must be one of: ${choices.join(', ')}\n`);
  process.exit(1);
}

async function requireReadableFile(filePath: string, flagName: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
  } catch {
    process.stderr.write(
      `error: --${flagName} file does not exist or is not readable: ${filePath}\n`,
    );
    process.exit(1);
  }
}

async function requireReadableFiles(filePaths: string[], flagName: string): Promise<void> {
  for (const filePath of filePaths) {
    await requireReadableFile(filePath, flagName);
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function runPost(argv: string[]): Promise<void> {
  // First pass: parse only common flags to determine platform
  // We need a two-pass parse because platform-specific flags aren't known yet.
  // To avoid erroring on unknown flags during the first pass, we do a quick scan.
  const platformRaw = (() => {
    const idx = argv.indexOf('--platform');
    const value = idx !== -1 ? argv[idx + 1] : undefined;
    return value !== undefined && !value.startsWith('-') ? value : undefined;
  })();

  if (platformRaw === undefined) {
    // Check if --help was requested before erroring
    if (argv.includes('--help') || argv.includes('-h')) {
      process.stdout.write(`signal-fire post --platform <p> --account <id> [platform flags]

Platforms: tiktok, x, facebook, linkedin, youtube, instagram

Run 'signal-fire post --platform <p> --help' for per-platform flags.\n`);
      return;
    }
    process.stderr.write('error: --platform is required\n');
    process.exit(1);
  }

  if (UNIMPLEMENTED_CLI_PLATFORMS.has(platformRaw as Platform)) {
    if (argv.includes('--help') || argv.includes('-h')) {
      process.stdout.write(`signal-fire post --platform ${platformRaw} (not yet implemented)\n`);
      return;
    }
    process.stderr.write(`error: platform "${platformRaw}" is not yet implemented in the CLI\n`);
    process.exit(1);
  }

  if (!VALID_PLATFORMS.includes(platformRaw as Platform)) {
    process.stderr.write(
      `error: unknown platform "${platformRaw}". Valid: ${VALID_PLATFORMS.join(', ')}\n`,
    );
    process.exit(1);
  }

  const platform = platformRaw as Platform;

  const allFlags = [...COMMON_FLAGS, ...(PLATFORM_SPECIFIC[platform] ?? [])];

  let flags: Flags;
  try {
    flags = parseFlags(argv, allFlags);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }

  if (bool(flags, 'help')) {
    process.stdout.write(`${PLATFORM_USAGE[platform]}\n`);
    return;
  }

  const accountId = str(flags, 'account');
  if (accountId === undefined) {
    process.stderr.write('error: --account is required\n');
    process.exit(1);
  }

  const cookiesFile = str(flags, 'cookies-file');
  if (cookiesFile !== undefined) await requireReadableFile(cookiesFile, 'cookies-file');

  // Build per-platform auth and input before loading the platform module.
  let input: unknown;
  let options: unknown;

  switch (platform) {
    case 'tiktok': {
      const video = str(flags, 'video');
      const description = str(flags, 'description');
      if (video === undefined) {
        process.stderr.write('error: --video is required for tiktok\n');
        process.exit(1);
      }
      if (description === undefined) {
        process.stderr.write('error: --description is required for tiktok\n');
        process.exit(1);
      }
      const cover = str(flags, 'cover');
      const scheduleAt = parseDateFlag(str(flags, 'schedule'), 'schedule');
      const visibility = parseChoice(str(flags, 'visibility'), 'visibility', TIKTOK_VISIBILITIES);
      await requireReadableFile(video, 'video');
      if (cover !== undefined) await requireReadableFile(cover, 'cover');
      input = {
        videoPath: video,
        description,
        ...(cover !== undefined && { coverPath: cover }),
        ...(str(flags, 'product-id') !== undefined && { productId: str(flags, 'product-id') }),
        ...(visibility !== undefined && { visibility }),
        ...(scheduleAt !== undefined && { schedule: { at: scheduleAt } }),
        ...(bool(flags, 'no-comments') && { allowComments: false }),
        ...(bool(flags, 'no-duet') && { allowDuet: false }),
        ...(bool(flags, 'no-stitch') && { allowStitch: false }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    case 'x': {
      const text = str(flags, 'text');
      if (text === undefined) {
        process.stderr.write('error: --text is required for x\n');
        process.exit(1);
      }
      const mediaPaths = arr(flags, 'media');
      await requireReadableFiles(mediaPaths, 'media');
      input = {
        text,
        ...(mediaPaths.length > 0 && { mediaPaths }),
        ...(str(flags, 'community-name') !== undefined && {
          communityName: str(flags, 'community-name'),
        }),
        ...(str(flags, 'community-id') !== undefined && {
          communityId: str(flags, 'community-id'),
        }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    case 'facebook': {
      const pageUrl = str(flags, 'page-url');
      const text = str(flags, 'text');
      if (pageUrl === undefined) {
        process.stderr.write('error: --page-url is required for facebook\n');
        process.exit(1);
      }
      if (text === undefined) {
        process.stderr.write('error: --text is required for facebook\n');
        process.exit(1);
      }
      const image = str(flags, 'image');
      if (image !== undefined) await requireReadableFile(image, 'image');
      input = {
        pageUrl,
        text,
        ...(image !== undefined && { imagePath: image }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    case 'linkedin': {
      const text = str(flags, 'text');
      if (text === undefined) {
        process.stderr.write('error: --text is required for linkedin\n');
        process.exit(1);
      }
      const image = str(flags, 'image');
      if (image !== undefined) await requireReadableFile(image, 'image');
      const target =
        parseChoice(str(flags, 'target'), 'target', LINKEDIN_TARGETS) ??
        (str(flags, 'company-page-url') !== undefined ? 'company' : 'profile');
      const companyPageUrl = str(flags, 'company-page-url');
      if (target === 'company' && companyPageUrl === undefined) {
        process.stderr.write('error: --company-page-url is required for linkedin company posts\n');
        process.exit(1);
      }
      input = {
        text,
        ...(image !== undefined && { imagePath: image }),
        target,
        ...(companyPageUrl !== undefined && { companyPageUrl }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    case 'youtube': {
      const video = str(flags, 'video');
      const title = str(flags, 'title');
      if (video === undefined) {
        process.stderr.write('error: --video is required for youtube\n');
        process.exit(1);
      }
      if (title === undefined) {
        process.stderr.write('error: --title is required for youtube\n');
        process.exit(1);
      }
      const thumbnail = str(flags, 'thumbnail');
      const scheduleAt = parseDateFlag(str(flags, 'schedule'), 'schedule');
      const visibility = parseChoice(str(flags, 'visibility'), 'visibility', YOUTUBE_VISIBILITIES);
      await requireReadableFile(video, 'video');
      if (thumbnail !== undefined) await requireReadableFile(thumbnail, 'thumbnail');
      const tags = arr(flags, 'tags');
      input = {
        videoPath: video,
        ...(thumbnail !== undefined && { thumbnailPath: thumbnail }),
        title,
        ...(str(flags, 'description') !== undefined && { description: str(flags, 'description') }),
        ...(tags.length > 0 && { tags }),
        ...(str(flags, 'playlist') !== undefined && { playlist: str(flags, 'playlist') }),
        ...(bool(flags, 'made-for-kids') && { madeForKids: true }),
        ...(visibility !== undefined && { visibility }),
        ...(scheduleAt !== undefined && { schedule: { at: scheduleAt } }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    case 'instagram': {
      const image = str(flags, 'image');
      if (image === undefined) {
        process.stderr.write('error: --image is required for instagram\n');
        process.exit(1);
      }
      await requireReadableFile(image, 'image');
      input = {
        imagePath: image,
        ...(str(flags, 'caption') !== undefined && { caption: str(flags, 'caption') }),
      };
      options = {
        accountId,
        ...(cookiesFile !== undefined && { auth: { cookiesFile } }),
      };
      break;
    }
    default: {
      process.stderr.write(`error: platform "${platform}" is not yet implemented in the CLI\n`);
      process.exit(1);
    }
  }

  const mod = await import(`../platforms/${platform}/index.js`);
  const result = (await mod.post(input, options)) as { ok: boolean; url?: string; error?: string };
  if (result.ok) {
    process.stdout.write(`posted${result.url !== undefined ? `: ${result.url}` : ''}\n`);
  } else {
    process.stderr.write(`failed: ${result.error ?? 'unknown error'}\n`);
    process.exit(2);
  }
}
