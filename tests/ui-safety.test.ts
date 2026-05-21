import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readLedger } from '../src/core/ledger.js';
import { readMetadata } from '../src/core/session.js';
import { REDESIGNED_APP_HTML } from '../src/ui/app-html.js';
import {
  buildLaunchOptions,
  buildManualCampaignInput,
  deleteAccount,
  getUiPortCandidates,
  isRetryableListenError,
  parseCampaignDelayMs,
  parseCampaignDelayRangeMs,
  resolveSpoofFingerprintForLaunch,
  setManualVerifyDriverForTests,
  shouldStopCampaignAfterError,
  startUiServer,
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
      Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
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

  it('removes UI state, history, and queue references so a deleted account is not rediscovered', async () => {
    const statePath = path.join(tmpDir, 'ui', 'state.json');
    const historyPath = path.join(tmpDir, 'ui', 'history.json');
    const queuePath = path.join(tmpDir, 'ui', 'queue.json');
    const otherMetaPath = path.join(tmpDir, 'sessions', 'facebook', 'Thomas Darby.meta.json');

    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify({ account: 'main' }));
    await fs.writeFile(
      historyPath,
      JSON.stringify([
        { id: 'old-main', account: 'main', platform: 'facebook', ok: true, status: 'posted' },
        {
          id: 'keep-other',
          account: 'Thomas Darby',
          platform: 'facebook',
          ok: true,
          status: 'posted',
        },
      ]),
    );
    await fs.writeFile(
      queuePath,
      JSON.stringify([
        { id: 'queued-main', account: 'main', targets: ['facebook'], status: 'queued' },
        { id: 'queued-other', account: 'Thomas Darby', targets: ['facebook'], status: 'queued' },
      ]),
    );
    await fs.mkdir(path.dirname(otherMetaPath), { recursive: true });
    await fs.writeFile(otherMetaPath, JSON.stringify({ accountId: 'Thomas Darby' }));

    const result = await deleteAccount('main');

    expect(result.ok).toBe(true);

    const state = JSON.parse(await fs.readFile(statePath, 'utf8')) as { account?: string };
    const history = JSON.parse(await fs.readFile(historyPath, 'utf8')) as Array<{
      account: string;
    }>;
    const queue = JSON.parse(await fs.readFile(queuePath, 'utf8')) as Array<{ account: string }>;

    expect(state.account).toBe('Thomas Darby');
    expect(history.map((entry) => entry.account)).toEqual(['Thomas Darby']);
    expect(queue.map((entry) => entry.account)).toEqual(['Thomas Darby']);
  });
});

describe('manual session verification', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    originalHome = process.env.SIGNAL_FIRE_HOME;
    process.env.SIGNAL_FIRE_HOME = tmpDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
    } else {
      process.env.SIGNAL_FIRE_HOME = originalHome;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('marks the selected account verified without requiring an active browser flow', async () => {
    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/session/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: 'facebook', account: 'Thomas Darby' }),
      });
      const body = (await response.json()) as { ok?: boolean };

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);

      const metadata = await readMetadata('facebook', 'Thomas Darby');
      expect(metadata).toMatchObject({
        platform: 'facebook',
        accountId: 'Thomas Darby',
        mode: 'userDataDir',
      });
      expect(Number.isNaN(new Date(metadata?.lastValidated ?? '').getTime())).toBe(false);
    } finally {
      await handle.close();
    }
  });
});

describe('manual campaign verification', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    originalHome = process.env.SIGNAL_FIRE_HOME;
    process.env.SIGNAL_FIRE_HOME = tmpDir;
    setManualVerifyDriverForTests(null);
  });

  afterEach(async () => {
    setManualVerifyDriverForTests(null);
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
    } else {
      process.env.SIGNAL_FIRE_HOME = originalHome;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function campaignForm(targets: string[]): FormData {
    const form = new FormData();
    form.set('account', 'main');
    form.set('text', 'Manual verify post');
    form.set('pageUrl', 'https://www.facebook.com/example');
    form.set('linkedinTarget', 'profile');
    form.set('campaignDelayMinSeconds', '0');
    form.set('campaignDelayMaxSeconds', '0');
    for (const target of targets) form.append('targets', target);
    return form;
  }

  it('forces dryRun on manual campaign inputs for the verified platforms', () => {
    const form = campaignForm(['x']);
    const assets = { imagePath: 'C:\\tmp\\image.jpg' };

    for (const platform of ['x', 'facebook', 'linkedin', 'instagram'] as const) {
      const input = buildManualCampaignInput(platform, form, assets) as { dryRun?: boolean };
      expect(input.dryRun).toBe(true);
    }
  });

  it('rejects unsupported manual targets before launching a browser', async () => {
    let launched = false;
    setManualVerifyDriverForTests({
      launch: async () => {
        launched = true;
        throw new Error('should not launch');
      },
      isLoggedIn: async () => true,
      compose: async () => undefined,
      markValidated: async () => undefined,
    });

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/campaign/manual`, {
        method: 'POST',
        body: campaignForm(['tiktok']),
      });
      const body = (await response.json()) as { error?: string };

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/Manual verify currently supports/i);
      expect(launched).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('prepares selected platforms with one shared context and blocks automatic posting until closed', async () => {
    const pages: object[] = [{}];
    const closeHandlers: Array<() => void> = [];
    const composed: Array<{ platform: string; input: { dryRun?: boolean } }> = [];
    let launchCount = 0;
    let closeCount = 0;

    setManualVerifyDriverForTests({
      launch: async () => {
        launchCount++;
        return {
          context: {
            pages: () => pages,
            newPage: async () => {
              const page = {};
              pages.push(page);
              return page;
            },
            on: (event: string, callback: () => void) => {
              if (event === 'close') closeHandlers.push(callback);
              return undefined;
            },
          } as never,
          close: async () => {
            closeCount++;
            for (const handler of closeHandlers) handler();
          },
        };
      },
      isLoggedIn: async () => true,
      compose: async (platform, _page, input) => {
        composed.push({ platform, input: input as { dryRun?: boolean } });
      },
      markValidated: async () => undefined,
    });

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/campaign/manual`, {
        method: 'POST',
        body: campaignForm(['x', 'facebook']),
      });
      const body = (await response.json()) as {
        campaignOk?: boolean;
        results?: Array<{ status?: string; detail?: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.campaignOk).toBe(true);
      expect(body.results?.map((result) => result.status)).toEqual(['prepared', 'prepared']);
      expect(launchCount).toBe(1);
      expect(pages).toHaveLength(2);
      expect(composed.map((entry) => [entry.platform, entry.input.dryRun])).toEqual([
        ['x', true],
        ['facebook', true],
      ]);
      await expect(readLedger('x', 'main')).resolves.toEqual([]);

      const automaticResponse = await fetch(`${handle.url}/api/campaign`, {
        method: 'POST',
        body: campaignForm(['x']),
      });
      const automaticBody = (await automaticResponse.json()) as { error?: string };

      expect(automaticResponse.status).toBe(400);
      expect(automaticBody.error).toMatch(/Manual verification browser is open/i);

      const historyResponse = await fetch(`${handle.url}/api/history?account=main`);
      const historyBody = (await historyResponse.json()) as {
        entries?: Array<{ status?: string; detail?: string }>;
      };
      expect(historyBody.entries?.map((entry) => entry.status)).toEqual(['prepared', 'prepared']);

      const logsResponse = await fetch(`${handle.url}/api/logs?account=main`);
      const logsBody = (await logsResponse.json()) as {
        entries?: Array<{ scope?: string; level?: string; message?: string }>;
      };
      expect(logsBody.entries?.some((entry) => entry.message === 'Manual prepare finished')).toBe(
        true,
      );
    } finally {
      await handle.close();
      expect(closeCount).toBe(1);
    }
  });

  it('exposes manual UI controls and guards live posting', () => {
    expect(REDESIGNED_APP_HTML).toContain('id="manualVerifyTop"');
    expect(REDESIGNED_APP_HTML).toContain('/api/campaign/manual');
    expect(REDESIGNED_APP_HTML).toContain('id="runLog"');
    expect(REDESIGNED_APP_HTML).toContain('id="copyRunLog"');
    expect(REDESIGNED_APP_HTML).toContain('/api/logs');
    expect(REDESIGNED_APP_HTML).toContain("window.confirm('Clear all run logs?");
    expect(REDESIGNED_APP_HTML).toContain('JSON.stringify(runLogEntries');
    expect(REDESIGNED_APP_HTML).toContain('refreshRunLogs()');
    expect(REDESIGNED_APP_HTML).toContain('window.confirm');
    expect(REDESIGNED_APP_HTML).toContain('id="checkForm"');
    expect(REDESIGNED_APP_HTML).not.toContain('Ready check');
  });
});

describe('UI server startup', () => {
  it('searches past broad Windows reserved port ranges before falling back to an OS port', () => {
    const candidates = getUiPortCandidates(4317);

    expect(candidates).toContain(4360);
    expect(candidates.at(-1)).toBe(0);
  });

  it('retries occupied or permission-denied local ports', () => {
    expect(isRetryableListenError(Object.assign(new Error('in use'), { code: 'EADDRINUSE' }))).toBe(
      true,
    );
    expect(isRetryableListenError(Object.assign(new Error('denied'), { code: 'EACCES' }))).toBe(
      true,
    );
    expect(
      isRetryableListenError(Object.assign(new Error('bad host'), { code: 'EADDRNOTAVAIL' })),
    ).toBe(false);
  });
});

describe('spoof fingerprint launch setting', () => {
  let tmpDir: string;
  let originalHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
    originalHome = process.env.SIGNAL_FIRE_HOME;
    process.env.SIGNAL_FIRE_HOME = tmpDir;
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
    } else {
      process.env.SIGNAL_FIRE_HOME = originalHome;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeState(state: unknown): Promise<void> {
    const statePath = path.join(tmpDir, 'ui', 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    await fs.writeFile(statePath, JSON.stringify(state), 'utf8');
  }

  it('defaults the UI state to real-machine mode', async () => {
    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/state`);
      const body = (await response.json()) as {
        state: { fields?: { spoofFingerprint?: boolean } };
      };
      expect(body.state.fields?.spoofFingerprint).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('adds the real-machine default to legacy state without the field', async () => {
    await writeState({ account: 'Thomas Darby', fields: { slowMoMs: '25' } });

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/state`);
      const body = (await response.json()) as {
        state: { fields?: { spoofFingerprint?: boolean; slowMoMs?: string } };
      };
      expect(body.state.fields?.slowMoMs).toBe('25');
      expect(body.state.fields?.spoofFingerprint).toBe(false);
    } finally {
      await handle.close();
    }
  });

  it('parses the campaign form field before falling back to saved state', async () => {
    await writeState({ fields: { spoofFingerprint: true } });

    const disabledForm = new FormData();
    disabledForm.set('spoofFingerprint', 'false');
    const disabledOptions = await buildLaunchOptions('facebook', 'Thomas Darby', disabledForm);
    expect(disabledOptions.spoofFingerprint).toBe(false);

    const enabledForm = new FormData();
    enabledForm.set('spoofFingerprint', 'false');
    enabledForm.append('spoofFingerprint', 'true');
    const enabledOptions = await buildLaunchOptions('facebook', 'Thomas Darby', enabledForm);
    expect(enabledOptions.spoofFingerprint).toBe(true);
  });

  it('uses saved state only when the request omits the setting', async () => {
    await writeState({ fields: { spoofFingerprint: true } });

    await expect(resolveSpoofFingerprintForLaunch(undefined)).resolves.toBe(true);
    await expect(resolveSpoofFingerprintForLaunch(false)).resolves.toBe(false);
  });
});
