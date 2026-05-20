import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _overrideCurrentChromeMajor,
  _overrideHostLocale,
  fingerprintPath,
  loadOrCreateFingerprint,
} from '../src/core/fingerprint.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-fingerprint-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  // Reset chrome major and host locale overrides so tests don't bleed into each other
  _overrideCurrentChromeMajor(undefined);
  _overrideHostLocale(undefined);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadOrCreateFingerprint', () => {
  it('regenerates the same deterministic fingerprint after cleanup', async () => {
    const first = await loadOrCreateFingerprint('alice');
    await fs.rm(fingerprintPath('alice'), { force: true });
    const second = await loadOrCreateFingerprint('alice');

    expect(second).toEqual(first);
  });

  it('creates distinct canvas noise seeds for 100 account ids', async () => {
    const seeds = new Set<number>();

    for (let i = 0; i < 100; i++) {
      const fp = await loadOrCreateFingerprint(`account-${i}`);
      seeds.add(fp.canvasNoiseSeed);
    }

    expect(seeds.size).toBe(100);
  });

  it('persists and re-reads an existing fingerprint without regenerating it', async () => {
    const first = await loadOrCreateFingerprint('persistent');
    const filePath = fingerprintPath('persistent');
    const edited = { ...first, userAgent: 'Manual Edit UA' };
    await fs.writeFile(filePath, JSON.stringify(edited, null, 2), 'utf8');

    await expect(loadOrCreateFingerprint('persistent')).resolves.toEqual(edited);
  });

  it('keeps labels with spaces distinct from compact labels', () => {
    expect(fingerprintPath('Thomas Darby')).not.toBe(fingerprintPath('ThomasDarby'));
    expect(fingerprintPath('Thomas Darby')).toContain('Thomas Darby');
  });

  it('preserves fingerprint when persisted platform matches host', async () => {
    const first = await loadOrCreateFingerprint('match-account');
    expect(first.platform).toBe('Win32');

    // Write a custom UA so we can detect if it gets regenerated
    const filePath = fingerprintPath('match-account');
    const edited = { ...first, userAgent: 'Preserved UA' };
    await fs.writeFile(filePath, JSON.stringify(edited, null, 2), 'utf8');

    const second = await loadOrCreateFingerprint('match-account');
    expect(second.userAgent).toBe('Preserved UA');
    expect(second.platform).toBe('Win32');
  });

  it('regenerates fingerprint when persisted Chrome major is more than 4 behind current', async () => {
    _overrideCurrentChromeMajor(131);
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    try {
      const filePath = fingerprintPath('version-stale-account');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const stale = {
        accountId: 'version-stale-account',
        createdAt: '2024-03-01T00:00:00.000Z',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.225 Safari/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        devicePixelRatio: 1,
        webglVendor: 'Intel Inc.',
        webglRenderer: 'Intel(R) UHD Graphics 620',
        canvasNoiseSeed: 54321,
        audioNoiseSeed: 98765,
        timezoneId: 'America/New_York',
        locale: 'en-US',
        fonts: ['Arial'],
        acceptLanguage: 'en-US,en;q=0.9',
      };
      await fs.writeFile(filePath, JSON.stringify(stale, null, 2), 'utf8');

      const result = await loadOrCreateFingerprint('version-stale-account');

      // UA should be updated to current major
      expect(result.userAgent).toContain('Chrome/131.');
      // canvasNoiseSeed must be preserved from old fingerprint
      expect(result.canvasNoiseSeed).toBe(54321);
      // File on disk must be rewritten
      const onDisk = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
        userAgent: string;
        canvasNoiseSeed: number;
      };
      expect(onDisk.userAgent).toContain('Chrome/131.');
      expect(onDisk.canvasNoiseSeed).toBe(54321);
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('preserves fingerprint when persisted Chrome major is within 4 of current', async () => {
    _overrideCurrentChromeMajor(131);
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    try {
      const filePath = fingerprintPath('version-fresh-account');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const fresh = {
        accountId: 'version-fresh-account',
        createdAt: '2024-09-01T00:00:00.000Z',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.91 Safari/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        devicePixelRatio: 1,
        webglVendor: 'Intel Inc.',
        webglRenderer: 'Intel(R) UHD Graphics 620',
        canvasNoiseSeed: 11223,
        audioNoiseSeed: 44556,
        timezoneId: 'America/New_York',
        locale: 'en-US',
        fonts: ['Arial'],
        acceptLanguage: 'en-US,en;q=0.9',
      };
      await fs.writeFile(filePath, JSON.stringify(fresh, null, 2), 'utf8');

      const result = await loadOrCreateFingerprint('version-fresh-account');

      // Should return the persisted fingerprint unchanged (130 is within 4 of 131)
      expect(result.userAgent).toContain('Chrome/130.');
      expect(result.canvasNoiseSeed).toBe(11223);
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('regenerates stale version fingerprint and result is stable on second call', async () => {
    _overrideCurrentChromeMajor(131);
    const filePath = fingerprintPath('version-stale-stable-account');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const stale = {
      accountId: 'version-stale-stable-account',
      createdAt: '2024-01-01T00:00:00.000Z',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.225 Safari/537.36',
      platform: 'Win32',
      vendor: 'Google Inc.',
      languages: ['en-US', 'en'],
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 1280,
      screenHeight: 800,
      colorDepth: 24,
      devicePixelRatio: 1,
      webglVendor: 'Intel Inc.',
      webglRenderer: 'Intel(R) UHD Graphics 620',
      canvasNoiseSeed: 77777,
      audioNoiseSeed: 88888,
      timezoneId: 'America/Chicago',
      locale: 'en-US',
      fonts: ['Arial'],
      acceptLanguage: 'en-US,en;q=0.9',
    };
    await fs.writeFile(filePath, JSON.stringify(stale, null, 2), 'utf8');

    const result = await loadOrCreateFingerprint('version-stale-stable-account');

    expect(result.platform).toBe('Win32');
    expect(result.userAgent).toContain('Chrome/131.');
    // Calling again should return the same regenerated fingerprint (idempotent)
    const second = await loadOrCreateFingerprint('version-stale-stable-account');
    expect(second.platform).toBe('Win32');
    expect(second.userAgent).toContain('Chrome/131.');
  });

  it('regenerates fingerprint when persisted locale language differs from host', async () => {
    _overrideHostLocale('en-US');
    const filePath = fingerprintPath('locale-stale-account');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const stale = {
      accountId: 'locale-stale-account',
      createdAt: '2024-06-01T00:00:00.000Z',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      platform: 'Win32',
      vendor: 'Google Inc.',
      languages: ['es-ES', 'es', 'en-US', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenWidth: 1920,
      screenHeight: 1080,
      colorDepth: 24,
      devicePixelRatio: 1,
      webglVendor: 'Intel Inc.',
      webglRenderer: 'Intel(R) UHD Graphics 620',
      canvasNoiseSeed: 12345,
      audioNoiseSeed: 67890,
      timezoneId: 'America/New_York',
      locale: 'es-MX',
      fonts: ['Arial'],
      acceptLanguage: 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    await fs.writeFile(filePath, JSON.stringify(stale, null, 2), 'utf8');

    const result = await loadOrCreateFingerprint('locale-stale-account');

    // Locale should now be English
    expect(result.locale.startsWith('en')).toBe(true);
    expect(result.languages[0]?.startsWith('en')).toBe(true);
    expect(result.acceptLanguage.startsWith('en')).toBe(true);
    // Noise seeds must be preserved
    expect(result.canvasNoiseSeed).toBe(12345);
    expect(result.audioNoiseSeed).toBe(67890);
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z');
  });

  it('preserves fingerprint when persisted locale matches host language', async () => {
    _overrideHostLocale('en-US');
    const filePath = fingerprintPath('locale-fresh-account');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const fresh = {
      accountId: 'locale-fresh-account',
      createdAt: '2024-07-01T00:00:00.000Z',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      platform: 'Win32',
      vendor: 'Google Inc.',
      languages: ['en-GB', 'en'],
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenWidth: 1920,
      screenHeight: 1080,
      colorDepth: 24,
      devicePixelRatio: 1,
      webglVendor: 'Intel Inc.',
      webglRenderer: 'Intel(R) UHD Graphics 620',
      canvasNoiseSeed: 99999,
      audioNoiseSeed: 11111,
      timezoneId: 'Europe/London',
      locale: 'en-GB',
      fonts: ['Arial'],
      acceptLanguage: 'en-GB,en;q=0.9',
    };
    await fs.writeFile(filePath, JSON.stringify(fresh, null, 2), 'utf8');

    const result = await loadOrCreateFingerprint('locale-fresh-account');

    // Should not regenerate — en-GB matches host language 'en'
    expect(result.locale).toBe('en-GB');
    expect(result.canvasNoiseSeed).toBe(99999);
  });

  it('regeneration preserves canvasNoiseSeed and audioNoiseSeed', async () => {
    _overrideCurrentChromeMajor(131);
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    try {
      const filePath = fingerprintPath('seed-preserve-account');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const stale = {
        accountId: 'seed-preserve-account',
        createdAt: '2024-02-15T12:00:00.000Z',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.225 Safari/537.36',
        platform: 'Win32',
        vendor: 'Google Inc.',
        languages: ['en-US', 'en'],
        hardwareConcurrency: 8,
        deviceMemory: 8,
        screenWidth: 1920,
        screenHeight: 1080,
        colorDepth: 24,
        devicePixelRatio: 1,
        webglVendor: 'Intel Inc.',
        webglRenderer: 'Intel(R) UHD Graphics 620',
        canvasNoiseSeed: 3141592,
        audioNoiseSeed: 2718281,
        timezoneId: 'America/New_York',
        locale: 'en-US',
        fonts: ['Arial'],
        acceptLanguage: 'en-US,en;q=0.9',
      };
      await fs.writeFile(filePath, JSON.stringify(stale, null, 2), 'utf8');

      const result = await loadOrCreateFingerprint('seed-preserve-account');

      expect(result.canvasNoiseSeed).toBe(3141592);
      expect(result.audioNoiseSeed).toBe(2718281);
      expect(result.createdAt).toBe('2024-02-15T12:00:00.000Z');
    } finally {
      platformSpy.mockRestore();
    }
  });
});
