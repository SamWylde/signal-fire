import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getSignalFireHome, sanitizeAccountId } from './account-id.js';
import { createLogger } from './logging.js';

const log = createLogger('fingerprint');
import { uniqueTempPath, withFileLock } from './file-lock.js';
import type { AccountId } from './types.js';

export interface AccountFingerprint {
  accountId: string;
  createdAt: string;
  userAgent: string;
  platform: 'Win32';
  vendor: string;
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  screenWidth: number;
  screenHeight: number;
  colorDepth: 24;
  devicePixelRatio: 1 | 1.25 | 1.5 | 2;
  webglVendor: string;
  webglRenderer: string;
  canvasNoiseSeed: number;
  audioNoiseSeed: number;
  timezoneId: string;
  locale: string;
  fonts: string[];
  acceptLanguage: string;
}

interface LocaleProfile {
  locale: string;
  languages: string[];
  acceptLanguage: string;
}

interface WebglProfile {
  vendor: string;
  renderers: string[];
}

/** Fallback Chrome major used only when detection fails AND persisted UA is unparseable. */
const FALLBACK_MAJOR = 131;

/** Module-level cache for the detected host locale. undefined = not yet resolved. */
let cachedHostLocale: string | undefined;

/**
 * Override the cached host locale — for testing only.
 * Pass undefined to reset to "not yet detected" state.
 */
export function _overrideHostLocale(locale: string | undefined): void {
  cachedHostLocale = locale;
}

/**
 * Returns the OS locale (e.g. 'en-US') detected via Intl, cached for process lifetime.
 * Falls back to 'en-US' if detection is unavailable or returns something unparseable.
 */
function hostLocale(): string {
  if (cachedHostLocale !== undefined) return cachedHostLocale;
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().locale;
    cachedHostLocale = typeof detected === 'string' && detected.length > 0 ? detected : 'en-US';
  } catch {
    cachedHostLocale = 'en-US';
  }
  return cachedHostLocale;
}

/** Extract the language code (e.g. 'en') from a locale string (e.g. 'en-US'). */
function languageCode(locale: string): string {
  return locale.split('-')[0] ?? 'en';
}

/**
 * Returns the subset of LOCALES whose language code matches the host OS language.
 * Falls back to ['en-US'] if no entries match (should never happen for English hosts).
 */
function localesForHost(): LocaleProfile[] {
  const hostLang = languageCode(hostLocale());
  const filtered = LOCALES.filter((p) => languageCode(p.locale) === hostLang);
  const fallback: LocaleProfile = {
    locale: 'en-US',
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
  };
  return filtered.length > 0 ? filtered : [fallback];
}

/** Module-level cache for the current Chrome major. undefined = not yet resolved. */
let cachedCurrentMajor: number | null | undefined;

/** Registered async detector; set by browser.ts via registerChromeMajorDetector(). */
let chromeMajorDetector: (() => Promise<number | null>) | null = null;

/**
 * Register an async function that detects the running Chrome/Chromium major version.
 * Called once by browser.ts at launch time (before loadOrCreateFingerprint).
 */
export function registerChromeMajorDetector(fn: () => Promise<number | null>): void {
  chromeMajorDetector = fn;
}

/**
 * Returns the current Chrome major version from the running browser binary, or null if
 * detection fails. Result is cached for the process lifetime.
 */
export async function currentChromeMajor(): Promise<number | null> {
  if (cachedCurrentMajor !== undefined) return cachedCurrentMajor;
  if (chromeMajorDetector !== null) {
    try {
      cachedCurrentMajor = await chromeMajorDetector();
    } catch {
      cachedCurrentMajor = null;
    }
  } else {
    cachedCurrentMajor = null;
  }
  return cachedCurrentMajor;
}

/**
 * Override the cached current Chrome major — for testing only.
 * Pass undefined to reset to "not yet probed" state.
 */
export function _overrideCurrentChromeMajor(major: number | null | undefined): void {
  cachedCurrentMajor = major;
}

/** Extract Chrome major version number from a User-Agent string, or null if not found. */
export function chromeMajorFromUA(userAgent: string): number | null {
  const match = userAgent.match(/Chrome\/(\d+)\./);
  if (match === undefined || match === null || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

/** Build a Chrome User-Agent string for the given major version number. */
function chromeUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

const SCREENS: Array<[number, number]> = [
  [1920, 1080],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [2560, 1440],
  [1280, 800],
  [1600, 900],
];

const WEBGL_PROFILES: WebglProfile[] = [
  {
    vendor: 'Intel Inc.',
    renderers: [
      'Intel(R) Iris(R) Xe Graphics',
      'Intel(R) UHD Graphics 620',
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ],
  },
  {
    vendor: 'NVIDIA Corporation',
    renderers: [
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ],
  },
  {
    vendor: 'AMD',
    renderers: [
      'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'AMD Radeon RX 6600 XT',
    ],
  },
  {
    vendor: 'Google Inc.',
    renderers: [
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      'Google SwiftShader',
    ],
  },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Detroit',
  'America/Indiana/Indianapolis',
  'America/Boise',
  'America/Toronto',
  'America/Vancouver',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Zurich',
  'Europe/Vienna',
];

const LOCALES: LocaleProfile[] = [
  { locale: 'en-US', languages: ['en-US', 'en'], acceptLanguage: 'en-US,en;q=0.9' },
  { locale: 'en-GB', languages: ['en-GB', 'en'], acceptLanguage: 'en-GB,en;q=0.9' },
  {
    locale: 'en-CA',
    languages: ['en-CA', 'en-US', 'en'],
    acceptLanguage: 'en-CA,en-US;q=0.9,en;q=0.8',
  },
  {
    locale: 'fr-FR',
    languages: ['fr-FR', 'fr', 'en-US', 'en'],
    acceptLanguage: 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    locale: 'de-DE',
    languages: ['de-DE', 'de', 'en-US', 'en'],
    acceptLanguage: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  },
  {
    locale: 'es-ES',
    languages: ['es-ES', 'es', 'en-US', 'en'],
    acceptLanguage: 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
  },
];

const FONTS = [
  'Arial',
  'Arial Black',
  'Bahnschrift',
  'Calibri',
  'Cambria',
  'Cambria Math',
  'Candara',
  'Comic Sans MS',
  'Consolas',
  'Constantia',
  'Corbel',
  'Courier New',
  'Ebrima',
  'Franklin Gothic Medium',
  'Gabriola',
  'Gadugi',
  'Georgia',
  'Impact',
  'Javanese Text',
  'Leelawadee UI',
  'Lucida Console',
  'Lucida Sans Unicode',
  'Malgun Gothic',
  'Microsoft Himalaya',
  'Microsoft JhengHei',
  'Microsoft New Tai Lue',
  'Microsoft PhagsPa',
  'Microsoft Sans Serif',
  'Microsoft Tai Le',
  'Microsoft YaHei',
  'Microsoft Yi Baiti',
  'MingLiU-ExtB',
  'Mongolian Baiti',
  'MS Gothic',
  'MV Boli',
  'Myanmar Text',
  'Nirmala UI',
  'Palatino Linotype',
  'Segoe MDL2 Assets',
  'Segoe Print',
  'Segoe Script',
  'Segoe UI',
  'Segoe UI Emoji',
  'Segoe UI Historic',
  'Segoe UI Symbol',
  'SimSun',
  'Sitka Text',
  'Sylfaen',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
  'Yu Gothic',
];

function readUInt32(digest: Buffer, offset: number): number {
  return digest.readUInt32BE(offset) >>> 0;
}

export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('Cannot pick from an empty fingerprint pool');
  return item;
}

function pickFonts(rng: () => number): string[] {
  const count = 12 + Math.floor(rng() * 7);
  const candidates = [...FONTS];
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i] as string;
    candidates[i] = candidates[j] as string;
    candidates[j] = tmp;
  }
  return candidates.slice(0, count).sort((left, right) => left.localeCompare(right));
}

function deterministicCreatedAt(digest: Buffer): string {
  const base = Date.UTC(2024, 0, 1);
  const days = readUInt32(digest, 12) % 730;
  const seconds = readUInt32(digest, 16) % 86_400;
  return new Date(base + days * 86_400_000 + seconds * 1000).toISOString();
}

async function generateFingerprint(accountId: AccountId): Promise<AccountFingerprint> {
  const digest = createHash('sha256').update(accountId).digest();
  const rng = makeRng(readUInt32(digest, 0));
  const locale = pick(localesForHost(), rng);
  const screen = pick(SCREENS, rng);
  const webgl = pick(WEBGL_PROFILES, rng);
  const detectedMajor = await currentChromeMajor();
  const chromeMajor = detectedMajor ?? FALLBACK_MAJOR;

  return {
    accountId,
    createdAt: deterministicCreatedAt(digest),
    userAgent: chromeUserAgent(chromeMajor),
    platform: 'Win32',
    vendor: 'Google Inc.',
    languages: locale.languages,
    hardwareConcurrency: pick([4, 8, 12, 16], rng),
    deviceMemory: pick([4, 8, 16], rng),
    screenWidth: screen[0],
    screenHeight: screen[1],
    colorDepth: 24,
    devicePixelRatio: pick([1, 1.25, 1.5, 2], rng),
    webglVendor: webgl.vendor,
    webglRenderer: pick(webgl.renderers, rng),
    canvasNoiseSeed: readUInt32(digest, 20),
    audioNoiseSeed: readUInt32(digest, 24),
    timezoneId: pick(TIMEZONES, rng),
    locale: locale.locale,
    fonts: pickFonts(rng),
    acceptLanguage: locale.acceptLanguage,
  };
}

async function regenerateFingerprint(
  accountId: AccountId,
  existing: AccountFingerprint,
): Promise<AccountFingerprint> {
  const fresh = await generateFingerprint(accountId);
  return {
    ...fresh,
    canvasNoiseSeed: existing.canvasNoiseSeed,
    audioNoiseSeed: existing.audioNoiseSeed,
    createdAt: existing.createdAt,
  };
}

export function fingerprintPath(accountId: AccountId): string {
  return path.join(getSignalFireHome(), 'fingerprints', `${sanitizeAccountId(accountId)}.json`);
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = uniqueTempPath(filePath);
  let handle: fs.FileHandle | undefined;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    handle = await fs.open(tmpPath, 'wx');
    await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function readFingerprint(filePath: string): Promise<AccountFingerprint | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as AccountFingerprint;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function isStale(fp: AccountFingerprint): Promise<boolean> {
  const persistedMajor = chromeMajorFromUA(fp.userAgent);
  const current = await currentChromeMajor();
  if (current !== null && persistedMajor !== null && current - persistedMajor >= 4) return true;
  if (languageCode(fp.locale) !== languageCode(hostLocale())) return true;
  return false;
}

/** Returns true if the fingerprint's locale language differs from the host locale language. */
function isLocaleStale(fp: AccountFingerprint): boolean {
  return languageCode(fp.locale) !== languageCode(hostLocale());
}

function logStaleReason(
  accountId: AccountId,
  fp: AccountFingerprint,
  current: number | null,
): void {
  if (isLocaleStale(fp)) {
    log.info(
      `${accountId} has stale locale (was ${fp.locale}, host is ${hostLocale()}) — regenerating`,
    );
  } else {
    const persistedMajor = chromeMajorFromUA(fp.userAgent);
    log.info(
      `${accountId} is stale (persisted Chrome ${String(persistedMajor)}, current ${String(current)}) — regenerating`,
    );
  }
}

export async function loadOrCreateFingerprint(accountId: AccountId): Promise<AccountFingerprint> {
  const filePath = fingerprintPath(accountId);
  const existing = await readFingerprint(filePath);
  if (existing !== null) {
    if (!(await isStale(existing))) return existing;
    const current = await currentChromeMajor();
    logStaleReason(accountId, existing, current);
    const fresh = await regenerateFingerprint(accountId, existing);
    await atomicWriteJson(filePath, fresh);
    return fresh;
  }

  return withFileLock(`${filePath}.lock`, async () => {
    const lockedExisting = await readFingerprint(filePath);
    if (lockedExisting !== null) {
      if (!(await isStale(lockedExisting))) return lockedExisting;
      const current = await currentChromeMajor();
      logStaleReason(accountId, lockedExisting, current);
    }
    const fingerprint = await generateFingerprint(accountId);
    await atomicWriteJson(filePath, fingerprint);
    return fingerprint;
  });
}
