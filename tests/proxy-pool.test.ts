import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ProxyPool,
  interpolateEnv,
  isNoProxySpecifier,
  parseProxyUrl,
} from '../src/core/proxy-pool.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-proxy-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('parseProxyUrl', () => {
  it('parses http URL without credentials', () => {
    expect(parseProxyUrl('http://host:8080')).toEqual({ server: 'http://host:8080' });
  });

  it('parses http URL with credentials', () => {
    expect(parseProxyUrl('http://user:pass@host:8080')).toEqual({
      server: 'http://host:8080',
      username: 'user',
      password: 'pass',
    });
  });

  it('parses socks5 URL without credentials', () => {
    expect(parseProxyUrl('socks5://1.2.3.4:1080')).toEqual({ server: 'socks5://1.2.3.4:1080' });
  });

  it('decodes URL-encoded credentials', () => {
    const result = parseProxyUrl('http://user%40name:p%40ss@host:8080');
    expect(result?.username).toBe('user@name');
    expect(result?.password).toBe('p@ss');
    expect(result?.server).toBe('http://host:8080');
  });

  it('returns undefined for garbage input', () => {
    expect(parseProxyUrl('not a url')).toBeUndefined();
  });
});

describe('interpolateEnv', () => {
  it('replaces env var placeholder with the value', () => {
    vi.stubEnv('MY_PROXY_PASS', 'secret');
    expect(interpolateEnv('http://user:${MY_PROXY_PASS}@host')).toBe('http://user:secret@host');
  });

  it('replaces unset env var with empty string', () => {
    // Use a var name that is guaranteed not set in the test environment.
    const key = 'SF_TEST_DEFINITELY_UNSET_42';
    delete process.env[key];
    expect(interpolateEnv(`prefix_\${${key}}_suffix`)).toBe('prefix__suffix');
  });
});

describe('isNoProxySpecifier', () => {
  it('matches the unset values used by the source proxy config', () => {
    expect(isNoProxySpecifier(undefined)).toBe(true);
    expect(isNoProxySpecifier('')).toBe(true);
    expect(isNoProxySpecifier(' none ')).toBe(true);
    expect(isNoProxySpecifier('null')).toBe(true);
    expect(isNoProxySpecifier('FALSE')).toBe(true);
    expect(isNoProxySpecifier('http://proxy:8080')).toBe(false);
  });
});

describe('ProxyPool.resolve — direct URL', () => {
  it('returns parsed config for a direct proxy URL', async () => {
    const pool = new ProxyPool();
    const result = await pool.resolve('http://user:pass@h:1');
    expect(result).toEqual({ server: 'http://h:1', username: 'user', password: 'pass' });
  });
});

describe('ProxyPool.resolve — none / undefined / empty', () => {
  it('returns undefined for undefined', async () => {
    const pool = new ProxyPool();
    expect(await pool.resolve(undefined)).toBeUndefined();
  });

  it("returns undefined for 'none'", async () => {
    const pool = new ProxyPool();
    expect(await pool.resolve('none')).toBeUndefined();
  });

  it("returns undefined for ''", async () => {
    const pool = new ProxyPool();
    expect(await pool.resolve('')).toBeUndefined();
  });

  it("returns undefined for 'null' and 'false' like the source repo", async () => {
    const pool = new ProxyPool();
    expect(await pool.resolve('null')).toBeUndefined();
    expect(await pool.resolve('false')).toBeUndefined();
  });

  it('returns undefined when env interpolation resolves to an unset proxy value', async () => {
    vi.stubEnv('SF_PROXY_VALUE', 'none');
    const pool = new ProxyPool();
    expect(await pool.resolve('${SF_PROXY_VALUE}')).toBeUndefined();
  });
});

describe('ProxyPool.resolve — pool, hash strategy', () => {
  it('is deterministic per accountId across multiple calls', async () => {
    const pool = new ProxyPool({
      pools: { main: ['http://proxy1:8080', 'http://proxy2:8080'] },
      strategy: 'hash',
    });

    const first = await pool.resolve('pool:main', 'acc-A');
    const second = await pool.resolve('pool:main', 'acc-A');
    expect(first).toEqual(second);

    const third = await pool.resolve('pool:main', 'acc-B');
    const fourth = await pool.resolve('pool:main', 'acc-B');
    expect(third).toEqual(fourth);
  });

  it('falls back to first entry when accountId is missing', async () => {
    const pool = new ProxyPool({
      pools: { main: ['http://proxy1:8080', 'http://proxy2:8080'] },
      strategy: 'hash',
    });
    const result = await pool.resolve('pool:main');
    expect(result).toEqual({ server: 'http://proxy1:8080' });
  });
});

describe('ProxyPool.resolve — pool, round-robin strategy', () => {
  it('cycles through pool entries in order', async () => {
    const stateFile = path.join(tmpDir, 'proxy-pool-state.json');
    const pool = new ProxyPool({
      pools: { rr: ['http://p1:1', 'http://p2:1', 'http://p3:1'] },
      strategy: 'round_robin',
      stateFile,
    });

    const r0 = await pool.resolve('pool:rr', 'any');
    const r1 = await pool.resolve('pool:rr', 'any');
    const r2 = await pool.resolve('pool:rr', 'any');
    const r3 = await pool.resolve('pool:rr', 'any');

    expect(r0?.server).toBe('http://p1:1');
    expect(r1?.server).toBe('http://p2:1');
    expect(r2?.server).toBe('http://p3:1');
    expect(r3?.server).toBe('http://p1:1');
  });

  it('state persists across ProxyPool instances', async () => {
    const stateFile = path.join(tmpDir, 'proxy-pool-state.json');
    const config = {
      pools: { rr: ['http://p1:1', 'http://p2:1', 'http://p3:1'] },
      strategy: 'round_robin' as const,
      stateFile,
    };

    const pool1 = new ProxyPool(config);
    await pool1.resolve('pool:rr');

    const pool2 = new ProxyPool(config);
    const result = await pool2.resolve('pool:rr');
    expect(result?.server).toBe('http://p2:1');
  });

  it('serializes concurrent round-robin resolves', async () => {
    const stateFile = path.join(tmpDir, 'proxy-pool-state.json');
    const pool = new ProxyPool({
      pools: { rr: ['http://p1:1', 'http://p2:1', 'http://p3:1'] },
      strategy: 'round_robin',
      stateFile,
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => pool.resolve('pool:rr', 'any')),
    );

    const counts = new Map<string, number>();
    for (const result of results) {
      const server = result?.server ?? '';
      counts.set(server, (counts.get(server) ?? 0) + 1);
    }

    expect(counts.get('http://p1:1')).toBe(2);
    expect(counts.get('http://p2:1')).toBe(2);
    expect(counts.get('http://p3:1')).toBe(2);
  });
});

describe('ProxyPool.resolve — missing pool', () => {
  it('throws when pool is not configured', async () => {
    const pool = new ProxyPool({ pools: {}, strategy: 'hash' });
    await expect(pool.resolve('pool:nonexistent', 'acc1')).rejects.toThrow(
      'Proxy pool "nonexistent" not found or empty',
    );
  });
});

describe('ProxyPool.resolve — env interpolation in pool URL', () => {
  it('interpolates env vars in pool proxy URLs', async () => {
    vi.stubEnv('ENV_USER', 'myuser');
    vi.stubEnv('ENV_PASS', 'mypass');

    const pool = new ProxyPool({
      pools: { secured: ['http://${ENV_USER}:${ENV_PASS}@h:1'] },
      strategy: 'hash',
    });

    const result = await pool.resolve('pool:secured', 'acc1');
    expect(result?.username).toBe('myuser');
    expect(result?.password).toBe('mypass');
    expect(result?.server).toBe('http://h:1');
  });

  it('returns undefined when a pool entry interpolates to a no-proxy value', async () => {
    vi.stubEnv('NO_PROXY_ENTRY', 'false');

    const pool = new ProxyPool({
      pools: { optional: ['${NO_PROXY_ENTRY}'] },
      strategy: 'hash',
    });

    await expect(pool.resolve('pool:optional', 'acc1')).resolves.toBeUndefined();
  });
});
