import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  deleteAccount,
  parseCampaignDelayMs,
  parseCampaignDelayRangeMs,
  shouldStopCampaignAfterError,
} from '../src/ui/server.js';

describe('UI campaign safety helpers', () => {
  it('parses fixed and range campaign delays', () => {
    expect(parseCampaignDelayMs('45')).toBe(45_000);
    expect(parseCampaignDelayRangeMs('120', '300')).toEqual({ minMs: 120_000, maxMs: 300_000 });
  });

  it('keeps old saved delay state as a fixed delay', () => {
    expect(parseCampaignDelayRangeMs('', '', '90')).toEqual({ minMs: 90_000, maxMs: 90_000 });
  });

  it('rejects inverted delay ranges', () => {
    expect(() => parseCampaignDelayRangeMs('300', '120')).toThrow(
      'Maximum delay between platforms',
    );
  });

  it('detects checkpoint and platform throttle errors', () => {
    expect(shouldStopCampaignAfterError('LinkedIn requires checkpoint verification')).toBe(true);
    expect(shouldStopCampaignAfterError('rate-limit:hour')).toBe(true);
    expect(shouldStopCampaignAfterError('not-logged-in')).toBe(false);
  });
});

describe('deleteAccount', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    originalHome = process.env.SIGNAL_FIRE_HOME;
    process.env.SIGNAL_FIRE_HOME = tmpDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      process.env.SIGNAL_FIRE_HOME = undefined;
    } else {
      process.env.SIGNAL_FIRE_HOME = originalHome;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('deletes fingerprint, profile, sessions, credentials, and blocks for an account', async () => {
    const accountId = 'testaccount';
    const safe = encodeURIComponent(accountId);

    const fingerprintPath = path.join(tmpDir, 'fingerprints', `${safe}.json`);
    const profileDir = path.join(tmpDir, 'profiles', safe);
    const sessionFile = path.join(tmpDir, 'sessions', 'facebook', `${safe}.json`);
    const metaFile = path.join(tmpDir, 'sessions', 'facebook', `${safe}.meta.json`);
    const credFile = path.join(tmpDir, 'credentials', 'facebook', `${safe}.json`);

    await fs.mkdir(path.dirname(fingerprintPath), { recursive: true });
    await fs.writeFile(fingerprintPath, '{}');
    await fs.mkdir(profileDir, { recursive: true });
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(sessionFile, '{}');
    await fs.writeFile(metaFile, '{}');
    await fs.mkdir(path.dirname(credFile), { recursive: true });
    await fs.writeFile(credFile, '{}');

    const result = await deleteAccount(accountId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await expect(fs.access(fingerprintPath)).rejects.toThrow();
    await expect(fs.access(profileDir)).rejects.toThrow();
    await expect(fs.access(sessionFile)).rejects.toThrow();
    await expect(fs.access(metaFile)).rejects.toThrow();
    await expect(fs.access(credFile)).rejects.toThrow();
  });

  it('succeeds idempotently when no data exists for the account', async () => {
    const result = await deleteAccount('ghostaccount');
    expect(result.ok).toBe(true);
  });

  it('rejects path-traversal account IDs', async () => {
    const result = await deleteAccount('../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/invalid/i);
  });

  it('rejects deletion of the last remaining account', async () => {
    const accountId = 'onlyaccount';
    const statePath = path.join(tmpDir, 'ui', 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ account: accountId }));

    const result = await deleteAccount(accountId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/last remaining account/i);
  });

  it('deletes ledger and profiles-legacy dirs for an account', async () => {
    const accountId = 'ledgertest';

    const ledgerFile = path.join(tmpDir, 'ledger', 'facebook', `${accountId}.json`);
    const profilesLegacyDir = path.join(tmpDir, 'profiles-legacy', `facebook-${accountId}`);

    await fs.mkdir(path.dirname(ledgerFile), { recursive: true });
    await fs.writeFile(ledgerFile, '[]');
    await fs.mkdir(profilesLegacyDir, { recursive: true });

    const result = await deleteAccount(accountId);

    expect(result.ok).toBe(true);
    await expect(fs.access(ledgerFile)).rejects.toThrow();
    await expect(fs.access(profilesLegacyDir)).rejects.toThrow();
  });
});
