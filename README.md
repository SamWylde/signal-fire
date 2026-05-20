# signal-fire

Browser-automation toolkit for posting to X, LinkedIn, Instagram, TikTok, Facebook, and YouTube without paid APIs. Modular per-platform architecture with shared browser/session/cookie infrastructure. TypeScript + Patchright.

## Status

Early scaffolding. See [PROGRESS.md](./PROGRESS.md) for live build status.

## Stack
- Node >= 22, TypeScript (strict, ESM)
- Patchright + Google Chrome with per-account persistent browser profiles
- pnpm, Vitest, Biome

## Layout
- `src/core/` - shared infrastructure (browser, session, rate limiter primitives, proxy pool, cookies)
- `src/platforms/` - per-platform posting modules
- `src/cli/` - command entry points (`post`, `login`, `status`)
- `research/` - read-only references: 8 source repos being mined for code and patterns

## Source repos being ported
- [x] TikTok - ported (untested against live TikTok)
- [x] X - ported (untested; composer/community posting only. Reply, retweet, quote, and threads are still TODO)
- [x] Facebook - ported (untested; selectors high staleness risk - revalidate against live FB)
- [x] LinkedIn - ported (untested; BEM selectors high staleness risk)
- [x] YouTube - ported (untested; high-revalidation-needed against current Studio)
- [x] Instagram - ported (photo only; reels/carousel/stories TODO)

The merged implementation has been re-audited against the local source repos in `research/`.
Notable carried-over behavior now includes TikTok 5-minute schedule normalization and product links, X source-style media filtering and community posting, YouTube thumbnails and playlist creation, LinkedIn feed-confirmation URLs, instauto-style shared action limits, and source-compatible proxy/cookie handling.

Pinterest, Reddit, and Threads are pending separate research and are not implemented in the CLI.

## Getting started
```bash
pnpm install
pnpm exec patchright install chrome  # required once if Chrome is not already installed
pnpm typecheck
pnpm test
```

Signal Fire's stealth browser mode requires Google Chrome. If Chrome is not found, browser launch fails with install instructions instead of silently falling back to bundled Chromium.

### Example: TikTok post
```ts
import { post } from 'signal-fire/platforms/tiktok';

const result = await post(
  {
    videoPath: './clip.mp4',
    description: 'Hello world #demo',
    productId: 'optional-product-id',
  },
  { accountId: 'main', auth: { cookiesFile: './tiktok-cookies.txt' } }
);
console.log(result);
```

> Live testing requires Google Chrome and valid TikTok cookies.

### Example: X post
```ts
import { post } from 'signal-fire/platforms/x';

const result = await post(
  {
    text: 'Hello from signal-fire #demo',
    mediaPaths: ['./pic.jpg'],
    communityName: 'Optional X Community',
  },
  { accountId: 'main', auth: { authToken: 'xxx', ct0: 'yyy' } }
);
```

### Example: Facebook Page post
```ts
import { post } from 'signal-fire/platforms/facebook';

const result = await post(
  {
    pageUrl: 'https://www.facebook.com/your-page-id',
    text: 'Hello from signal-fire',
    imagePath: './pic.jpg',
  },
  { accountId: 'main', auth: { cookiesFile: './fb-cookies.json' } }
);
```

### Example: LinkedIn post
```ts
import { post } from 'signal-fire/platforms/linkedin';

const result = await post(
  { text: 'Hello from signal-fire', imagePath: './pic.jpg' },
  {
    accountId: 'main',
    auth: { credentials: { username: 'me@example.com', password: '...' }, allowInteractiveCheckpoint: true },
  }
);
```

### Example: YouTube upload
```ts
import { post } from 'signal-fire/platforms/youtube';

const result = await post(
  {
    videoPath: './clip.mp4',
    thumbnailPath: './thumb.jpg',
    title: 'My new video',
    description: 'Long description...',
    tags: ['demo', 'tutorial'],
    playlist: 'Demo uploads',
    visibility: 'unlisted',
  },
  { accountId: 'main', auth: { cookiesFile: './youtube-cookies.txt' } }
);
```

### Example: Instagram post
```ts
import { post } from 'signal-fire/platforms/instagram';

const result = await post(
  { imagePath: './pic.jpg', caption: 'Hello from signal-fire #demo' },
  { accountId: 'main', auth: { cookiesFile: './ig-cookies.json' } }
);
```

## CLI

```bash
# Save a session by logging in interactively
signal-fire login --platform tiktok --account main

# Post
signal-fire post --platform tiktok --account main \
  --video clip.mp4 --description "Hello world" --product-id optional-product-id

# Status
signal-fire status
```

Requires `pnpm build` first (or use `pnpm dev <command>` in development).

The CLI currently supports posting for TikTok, X, Facebook, LinkedIn, YouTube, and Instagram. Pinterest, Reddit, and Threads return a clear "not yet implemented" error.

## Desktop app

```bash
pnpm desktop
```

This builds the TypeScript project, starts the local Signal Fire UI server internally, and opens it in an Electron desktop window. Saved sessions still live in `~/.signal-fire`.

## License
TBD
