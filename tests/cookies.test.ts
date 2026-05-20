import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  loadCookies,
  parseJsonCookies,
  parseNetscape,
  remapTwitterToX,
} from '../src/core/cookies.js';

// ---------------------------------------------------------------------------
// 1. Netscape parser
// ---------------------------------------------------------------------------
describe('parseNetscape', () => {
  it('parses a valid Netscape cookie file', () => {
    const content = `# Netscape HTTP Cookie File
.example.com\tTRUE\t/\tFALSE\t1893456000\tsession_id\tabc123
`;
    const cookies = parseNetscape(content);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      name: 'session_id',
      value: 'abc123',
      domain: '.example.com',
      path: '/',
      expires: 1893456000,
    });
  });

  it('skips comment lines', () => {
    const content = `# Netscape HTTP Cookie File
# This line is also a comment
.example.com\tTRUE\t/\tFALSE\t0\ttoken\txyz
`;
    const cookies = parseNetscape(content);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('token');
  });

  it('handles # HttpOnly_ prefix: sets httpOnly and parses domain', () => {
    const content =
      '# HttpOnly_.secure.com\tFALSE\t/path\tTRUE\t1700000000\tauthToken\tsecretval\n';
    const cookies = parseNetscape(content);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({
      name: 'authToken',
      value: 'secretval',
      domain: '.secure.com',
      path: '/path',
      httpOnly: true,
      secure: true,
      expires: 1700000000,
    });
  });

  it('treats expiry "0" as session cookie (expires: -1)', () => {
    const content = '.example.com\tFALSE\t/\tFALSE\t0\tsess\tval\n';
    const cookies = parseNetscape(content);
    expect(cookies[0]?.expires).toBe(-1);
  });

  it('skips lines with fewer than 7 tab-separated fields', () => {
    const content = 'tooshort\tfields\n';
    const cookies = parseNetscape(content);
    expect(cookies).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. JSON parser — wrapped form and bare-array form
// ---------------------------------------------------------------------------
describe('parseJsonCookies', () => {
  it('parses bare array form', () => {
    const input = JSON.stringify([
      { name: 'foo', value: 'bar', domain: '.example.com', path: '/', secure: true },
    ]);
    const cookies = parseJsonCookies(input);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: 'foo', value: 'bar', secure: true });
  });

  it('unwraps { cookies: [...] } wrapper form', () => {
    const input = JSON.stringify({
      cookies: [{ name: 'wrapped', value: 'yes', domain: '.example.com' }],
    });
    const cookies = parseJsonCookies(input);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('wrapped');
  });

  it('normalizes expirationDate to expires', () => {
    const input = JSON.stringify([{ name: 'ext', value: 'val', expirationDate: 1893456000.5 }]);
    const cookies = parseJsonCookies(input);
    // Should be floored to integer
    expect(cookies[0]?.expires).toBe(1893456000);
  });

  it('normalizes sameSite no_restriction → None', () => {
    const input = JSON.stringify([{ name: 'n', value: 'v', sameSite: 'no_restriction' }]);
    const cookies = parseJsonCookies(input);
    expect(cookies[0]?.sameSite).toBe('None');
  });

  it('normalizes sameSite unspecified → None', () => {
    const input = JSON.stringify([{ name: 'n', value: 'v', sameSite: 'unspecified' }]);
    const cookies = parseJsonCookies(input);
    expect(cookies[0]?.sameSite).toBe('None');
  });

  it('normalizes sameSite strict (lowercase) → Strict', () => {
    const input = JSON.stringify([{ name: 'n', value: 'v', sameSite: 'strict' }]);
    const cookies = parseJsonCookies(input);
    expect(cookies[0]?.sameSite).toBe('Strict');
  });

  it('normalizes sameSite lax (lowercase) → Lax', () => {
    const input = JSON.stringify([{ name: 'n', value: 'v', sameSite: 'lax' }]);
    const cookies = parseJsonCookies(input);
    expect(cookies[0]?.sameSite).toBe('Lax');
  });

  it('drops unknown fields like storeId, hostOnly, session', () => {
    const input = JSON.stringify([
      { name: 'c', value: 'v', storeId: '0', hostOnly: true, session: false },
    ]);
    const cookies = parseJsonCookies(input);
    expect(cookies[0]).not.toHaveProperty('storeId');
    expect(cookies[0]).not.toHaveProperty('hostOnly');
    expect(cookies[0]).not.toHaveProperty('session');
  });
});

// ---------------------------------------------------------------------------
// 3. remapTwitterToX
// ---------------------------------------------------------------------------
describe('remapTwitterToX', () => {
  it('remaps .twitter.com → .x.com', () => {
    const input = [{ name: 'auth', value: 'tok', domain: '.twitter.com' }];
    const result = remapTwitterToX(input);
    expect(result[0]?.domain).toBe('.x.com');
  });

  it('remaps twitter.com (no leading dot) → x.com', () => {
    const input = [{ name: 'auth', value: 'tok', domain: 'twitter.com' }];
    const result = remapTwitterToX(input);
    expect(result[0]?.domain).toBe('x.com');
  });

  it('remaps twitter.com subdomains while preserving the prefix', () => {
    const input = [{ name: 'auth', value: 'tok', domain: '.mobile.twitter.com' }];
    const result = remapTwitterToX(input);
    expect(result[0]?.domain).toBe('.mobile.x.com');
  });

  it('leaves non-twitter domains unchanged', () => {
    const input = [{ name: 'auth', value: 'tok', domain: '.facebook.com' }];
    const result = remapTwitterToX(input);
    expect(result[0]?.domain).toBe('.facebook.com');
  });

  it('does not rewrite domains that merely contain the string twitter.com', () => {
    const input = [{ name: 'auth', value: 'tok', domain: '.notwitter.com' }];
    const result = remapTwitterToX(input);
    expect(result[0]?.domain).toBe('.notwitter.com');
  });

  it('does not mutate the input array', () => {
    const input = [{ name: 'auth', value: 'tok', domain: '.twitter.com' }];
    const original = { ...input[0] };
    remapTwitterToX(input);
    expect(input[0]?.domain).toBe(original.domain);
  });
});

// ---------------------------------------------------------------------------
// 4. loadCookies auto-detection
// ---------------------------------------------------------------------------
describe('loadCookies', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sf-cookies-test-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('auto-detects and parses Netscape format', async () => {
    const filePath = path.join(tmpDir, 'cookies.txt');
    await fsp.writeFile(
      filePath,
      '# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tmykey\tmyval\n',
      'utf8',
    );
    const cookies = await loadCookies(filePath);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('mykey');
  });

  it('auto-detects and parses JSON format (array)', async () => {
    const filePath = path.join(tmpDir, 'cookies.json');
    await fsp.writeFile(
      filePath,
      JSON.stringify([{ name: 'jkey', value: 'jval', domain: '.example.com' }]),
      'utf8',
    );
    const cookies = await loadCookies(filePath);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('jkey');
  });

  it('auto-detects and parses JSON format (wrapped object)', async () => {
    const filePath = path.join(tmpDir, 'cookies2.json');
    await fsp.writeFile(
      filePath,
      JSON.stringify({ cookies: [{ name: 'wkey', value: 'wval' }] }),
      'utf8',
    );
    const cookies = await loadCookies(filePath);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]?.name).toBe('wkey');
  });
});
