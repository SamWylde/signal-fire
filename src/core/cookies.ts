import * as fs from 'node:fs/promises';

import type { BrowserContext } from './browser.js';

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // unix seconds; -1 for session
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  url?: string; // mutually exclusive with domain+path
}

// Parse Netscape format (tab-separated, # Netscape HTTP Cookie File header optional).
// Format: domain<TAB>flag<TAB>path<TAB>secure<TAB>expiry<TAB>name<TAB>value
export function parseNetscape(content: string): PlaywrightCookie[] {
  const cookies: PlaywrightCookie[] = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trimEnd();
    // Skip empty lines and comment lines (but detect # HttpOnly_ prefix first)
    if (line === '') continue;

    let httpOnly = false;
    let workingLine = line;

    // Some exporters prepend # HttpOnly_ to the domain field
    if (workingLine.startsWith('#')) {
      const httpOnlyMatch = workingLine.match(/^#\s*HttpOnly_(.*)/);
      if (httpOnlyMatch !== null) {
        httpOnly = true;
        workingLine = httpOnlyMatch[1] ?? '';
      } else {
        // Regular comment — skip
        continue;
      }
    }

    const parts = workingLine.split('\t');
    if (parts.length < 7) continue;

    const domain = parts[0] ?? '';
    // parts[1] is the subdomain flag (TRUE/FALSE) — we ignore it
    const cookiePath = parts[2] ?? '/';
    const secureStr = parts[3] ?? 'FALSE';
    const expiryStr = parts[4] ?? '';
    const name = parts[5] ?? '';
    const value = parts[6] ?? '';

    const expiryNum = Number.parseInt(expiryStr, 10);
    const expires = Number.isNaN(expiryNum) || expiryNum === 0 ? -1 : expiryNum;

    const cookie: PlaywrightCookie = {
      name,
      value,
      domain,
      path: cookiePath,
      expires,
      ...(httpOnly && { httpOnly: true }),
      ...(secureStr.toUpperCase() === 'TRUE' && { secure: true }),
    };

    cookies.push(cookie);
  }
  return cookies;
}

function normalizeSameSite(raw: unknown): 'Strict' | 'Lax' | 'None' | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'string') return undefined;
  const lower = raw.toLowerCase();
  if (lower === 'strict') return 'Strict';
  if (lower === 'lax') return 'Lax';
  if (lower === 'none' || lower === 'no_restriction' || lower === 'unspecified') return 'None';
  return undefined;
}

// Parse a JSON array of cookies from a browser extension export.
// Accepts { "cookies": [...] } wrapper or top-level array.
export function parseJsonCookies(content: string): PlaywrightCookie[] {
  const parsed: unknown = JSON.parse(content);
  let rawList: Record<string, unknown>[];

  if (Array.isArray(parsed)) {
    rawList = parsed as Record<string, unknown>[];
  } else if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'cookies' in parsed &&
    Array.isArray((parsed as Record<string, unknown>).cookies)
  ) {
    rawList = (parsed as { cookies: Record<string, unknown>[] }).cookies;
  } else {
    return [];
  }

  const cookies: PlaywrightCookie[] = [];
  for (const raw of rawList) {
    const name = typeof raw.name === 'string' ? raw.name : '';
    const value = typeof raw.value === 'string' ? raw.value : '';

    // expirationDate (extension) -> expires (Playwright)
    const expiresRaw = raw.expires ?? raw.expirationDate;
    const expiresNum = typeof expiresRaw === 'number' ? Math.floor(expiresRaw) : undefined;

    const sameSite = normalizeSameSite(raw.sameSite);

    const cookie: PlaywrightCookie = {
      name,
      value,
      ...(typeof raw.domain === 'string' && { domain: raw.domain }),
      ...(typeof raw.path === 'string' && { path: raw.path }),
      ...(expiresNum !== undefined && { expires: expiresNum }),
      ...(raw.httpOnly === true && { httpOnly: true }),
      ...(raw.secure === true && { secure: true }),
      ...(sameSite !== undefined && { sameSite }),
      ...(typeof raw.url === 'string' && { url: raw.url }),
    };

    cookies.push(cookie);
  }
  return cookies;
}

// Auto-detect format and load from a file path.
// Detection: first non-empty, non-comment line starting with '[' or '{' → JSON; else → Netscape.
export async function loadCookies(filePath: string): Promise<PlaywrightCookie[]> {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  let firstMeaningfulLine = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    firstMeaningfulLine = trimmed;
    break;
  }

  if (firstMeaningfulLine.startsWith('[') || firstMeaningfulLine.startsWith('{')) {
    return parseJsonCookies(content);
  }
  return parseNetscape(content);
}

// Remap twitter.com → x.com domains. Pure function, does not mutate input.
export function remapTwitterToX(cookies: PlaywrightCookie[]): PlaywrightCookie[] {
  return cookies.map((c) => {
    if (c.domain === undefined) return c;
    const remapped = c.domain.replace(/(^|\.)twitter\.com$/i, '$1x.com');
    if (remapped === c.domain) return c;
    return { ...c, domain: remapped };
  });
}

// Apply cookies to a BrowserContext. Skips per-cookie errors, returns { added, skipped }.
// If navigateUrl is provided, navigates a fresh page to that URL first.
export async function applyCookies(
  context: BrowserContext,
  cookies: PlaywrightCookie[],
  navigateUrl?: string,
): Promise<{ added: number; skipped: number }> {
  if (navigateUrl !== undefined) {
    const page = await context.newPage();
    await page.goto(navigateUrl);
    await page.close();
  }

  let added = 0;
  let skipped = 0;

  for (const cookie of cookies) {
    try {
      await context.addCookies([cookie]);
      added++;
    } catch {
      skipped++;
    }
  }

  return { added, skipped };
}
