# signal-fire Build Progress

Last updated: 2026-05-16 (source-repo conversion audit and parity fixes)

- [x] All initial 6 platforms ported (untested against live)

## Status legend
- [x] = done
- [~] = in progress
- [ ] = not started
- [!] = blocked / needs decision

> Note: requires `pnpm exec playwright install chromium` before first browser launch.

## Source repos (research/)

| Repo | Status | Notes |
|------|--------|-------|
| tiktok-uploader | ported | Python+Playwright, freshest source (2026-02-11). Near 1:1 port planned. |
| twitter-automation-ai | ported (composer; reply/retweet/scheduler still TODO) | Python+Selenium, freshest commit (2026-05-12). Port composer + proxy pool, drop LLM half. |
| instauto | posting greenfield (rate limiter + cookies adopted in core) | TS+Puppeteer. Rate limiter is the prize — port to TS+Playwright. |
| social-poster | reference only | JS+Puppeteer. Architecture pattern + auto-recorder concept only. |

> **Note**: X port uses twitter-automation-ai as primary source (freshest, deepest); social-poster x-com.js is a **secondary source** for sidebar-compose selectors (`tweetButtonInline`) — its post-button selector is included as a fallback path.
| facebook-automation | ported (revalidate selectors against live FB) | Already TS+Playwright but 4yr stale. Template only; revalidate every selector. |
| linkedin-puppeteer | ported (BEM selectors high staleness risk) | JS+Puppeteer, 2.5yr stale. Port ~50 lines of modal flow; add session persistence. |
| youtube_uploader_selenium | ported (selectors need live re-recording against current Studio) | Python+Selenium, 3yr stale. Revalidate all selectors before porting. |
| puppeteer-extra | install as deps | Use playwright-extra + puppeteer-extra-plugin-stealth as npm deps. |

> YouTube selectors are placeholder; many will need re-recording against current Studio. Test in headed mode first.

## Core modules (src/core/)

- [x] browser.ts — playwright-extra + stealth wiring
- [x] session.ts — storageState per (platform, account)
- [x] cookies.ts — Netscape + JSON parsers
- [x] humanize.ts — random delays, typing, action-blocked detection
- [x] ledger.ts — JSON DB for action history (per platform/account)
- [x] rate-limiter.ts — sliding-window throttle (port from instauto)
- [x] proxy-pool.ts — named pools, hash/round-robin (port from twitter-automation-ai)
- [ ] selector-validator.ts — auto-recorder atop Playwright codegen (later)
- [x] types.ts — shared Platform/AccountId/PostInput types

## Platforms (src/platforms/)

- [x] tiktok — ported (untested against live TikTok)
- [x] x — ported (untested; reply/retweet/quote/threads still TODO)
- [x] facebook — ported (untested; selectors high staleness risk — revalidate against live FB)
- [x] linkedin — ported (untested; BEM selectors high staleness risk)
- [x] youtube — ported (untested; selectors need re-recording against current Studio)
- [x] instagram — ported (photo only; reels, carousel, stories TODO)
- [ ] pinterest — needs research (no source repo yet)
- [ ] reddit — needs research (no source repo yet)
- [ ] threads — needs research (no source repo yet)

## CLI / orchestration

- [x] cli/index.ts — entry, command parser (post / login / status)
- [x] cli/post.ts — rejects Pinterest, Reddit, and Threads before dynamic platform imports
- [ ] cli/scheduler.ts — cron-like scheduler with rate-limit awareness
  - Note: Scheduler not yet built — defer until live posting validates the per-platform modules.

## Scaffolding milestones

- [x] Cloned all 8 source repos to research/
- [x] Research synthesis written (see prior conversation / git log)
- [x] First platform port complete (TikTok)
- [x] Second platform port complete (X)
- [x] Third platform port complete (Facebook)
- [x] Fourth platform port complete (LinkedIn)
- [x] Fifth platform port complete (YouTube)
- [x] Sixth platform port complete (Instagram)
- [x] CLI built (post / login / status)
- [x] Project scaffold (package.json, tsconfig, biome, dirs)
- [x] Dependencies installed (pnpm install)
- [x] First green typecheck
- [x] First green test run

## Tooling fixes

- [x] vitest scoped to tests/ + src/ (research/ excluded via vitest.config.ts)
- [x] smoke test script overrides the default smoke-file exclusion
- [x] package exports match documented platform import examples
- [x] core ledger/proxy writes serialize concurrent updates
- [x] auth checks navigate before probing logged-in selectors

## Source-audit fixes

- [x] instauto parity: shared action groups for follow/unfollow limits, `noActionTaken` exclusion, cooldown floor behavior.
- [x] twitter-automation-ai parity: broader no-proxy handling, X media filtering now prefers one video / four images / one unknown file, X community audience support.
- [x] X cookie compatibility: twitter.com subdomain cookies remap to x.com subdomains.
- [x] tiktok-uploader parity: schedule minutes normalize upward to 5-minute increments, supported file-type checks, product-link best-effort flow.
- [x] youtube_uploader_selenium parity: scoped upload-dialog file input, thumbnail upload support, scoped playlist lookup, missing-playlist creation.
- [x] linkedin-puppeteer parity: publish waits for feed update confirmation and returns the LinkedIn post URL when a `data-urn` is available.

## Current verification

- [x] `pnpm test` - green (use Vitest output as the source of truth for the current count)
- [x] `pnpm build` - green
- [x] `pnpm lint` - green
- [x] `pnpm test:smoke` - Chromium launch smoke green
