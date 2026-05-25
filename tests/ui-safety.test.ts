import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isForbiddenIp, safeFetchToBuffer } from '../src/ui/safe-fetch.js';

import { readLedger } from '../src/core/ledger.js';
import { readMetadata } from '../src/core/session.js';
import { REDESIGNED_APP_HTML } from '../src/ui/app-html.js';
import {
  buildLaunchOptions,
  deleteAccount,
  getUiPortCandidates,
  isRetryableListenError,
  parseCampaignDelayMs,
  parseCampaignDelayRangeMs,
  resolveSpoofFingerprintForLaunch,
  saveUploadedFile,
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

  it('runs manual prepare with submit:false and propagates typing speed', async () => {
    const calls: Array<{
      platform: string;
      submit: boolean;
      input: { dryRun?: boolean; typingSpeedMultiplier?: number };
    }> = [];

    setManualVerifyDriverForTests({
      launch: async () => ({
        context: {
          pages: () => [{}],
          newPage: async () => ({}),
          on: () => undefined,
        } as never,
        close: async () => undefined,
      }),
      post: async (platform, input, options) => {
        calls.push({
          platform,
          submit: options.submit,
          input: input as { dryRun?: boolean; typingSpeedMultiplier?: number },
        });
        return {
          ok: true,
          status: 'prepared',
          detail: 'Form filled - submit manually in browser tab',
        };
      },
    });

    const form = campaignForm(['x', 'facebook', 'linkedin']);
    form.set('typingSpeedPercent', '3');

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/campaign/manual`, {
        method: 'POST',
        body: form,
      });
      expect(response.status).toBe(200);

      expect(calls).toHaveLength(3);
      for (const call of calls) {
        expect(call.submit).toBe(false);
        expect(call.input.typingSpeedMultiplier).toBe(3);
        // Manual prepare does NOT inject dryRun at the campaign layer; the platform's
        // own post() injects it before calling the composer. The test asserts the
        // observable contract: post() is called with submit:false.
      }
    } finally {
      await handle.close();
    }
  });

  it('rejects unsupported manual targets before launching a browser', async () => {
    let launched = false;
    setManualVerifyDriverForTests({
      launch: async () => {
        launched = true;
        throw new Error('should not launch');
      },
      post: async () => {
        throw new Error('should not call post');
      },
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
    const composed: Array<{ platform: string; input: { dryRun?: boolean }; submit: boolean }> = [];
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
      post: async (platform, input, options) => {
        composed.push({
          platform,
          input: input as { dryRun?: boolean },
          submit: options.submit,
        });
        return {
          ok: true,
          status: 'prepared',
          detail: 'Form filled - submit manually in browser tab',
        };
      },
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
      expect(composed.map((entry) => [entry.platform, entry.submit])).toEqual([
        ['x', false],
        ['facebook', false],
      ]);
      await expect(readLedger('x', 'main')).resolves.toEqual([]);

      const automaticResponse = await fetch(`${handle.url}/api/campaign`, {
        method: 'POST',
        body: campaignForm(['x']),
      });
      const automaticBody = (await automaticResponse.json()) as { error?: string };

      expect(automaticResponse.status).toBe(409);
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

  it('uses saved draft image paths when the file input is empty after reopening', async () => {
    const uploadDir = path.join(tmpDir, 'uploads', 'draft-image');
    const imagePath = path.join(uploadDir, 'logo.png');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(imagePath, 'fake-image');

    const composed: Array<{
      platform: string;
      input: { dryRun?: boolean; imagePath?: string };
      submit: boolean;
    }> = [];
    setManualVerifyDriverForTests({
      launch: async () => ({
        context: {
          pages: () => [{}],
          newPage: async () => ({}),
          on: () => undefined,
        } as never,
        close: async () => undefined,
      }),
      post: async (platform, input, options) => {
        composed.push({
          platform,
          input: input as { dryRun?: boolean; imagePath?: string },
          submit: options.submit,
        });
        return {
          ok: true,
          status: 'prepared',
          detail: 'Form filled - submit manually in browser tab',
        };
      },
    });

    const form = campaignForm(['instagram']);
    form.set('savedImagePath', imagePath);

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/campaign/manual`, {
        method: 'POST',
        body: form,
      });
      const body = (await response.json()) as { campaignOk?: boolean };

      expect(response.status).toBe(200);
      expect(body.campaignOk).toBe(true);
      expect(composed).toHaveLength(1);
      expect(composed[0]?.platform).toBe('instagram');
      // Manual prepare contracts: submit:false; imagePath flows through input
      expect(composed[0]?.submit).toBe(false);
      expect(composed[0]?.input.imagePath).toBe(imagePath);
    } finally {
      await handle.close();
    }
  });

  it('surfaces debug artifact paths when a platform reports them', async () => {
    const fakeScreenshotPath = path.join(tmpDir, 'ui', 'debug', 'x-screenshot.png');
    const fakeDomPath = path.join(tmpDir, 'ui', 'debug', 'x-dom.txt');
    await fs.mkdir(path.dirname(fakeScreenshotPath), { recursive: true });
    await fs.writeFile(fakeScreenshotPath, 'fake-png');
    await fs.writeFile(fakeDomPath, 'fake-dom');

    setManualVerifyDriverForTests({
      launch: async () => ({
        context: {
          pages: () => [{}],
          newPage: async () => ({}),
          on: () => undefined,
        } as never,
        close: async () => undefined,
      }),
      post: async () => ({
        ok: false,
        status: 'failed',
        error: 'selector drift',
        detail: `selector drift at https://x.com/compose/post — debug: ${fakeScreenshotPath} ${fakeDomPath}`,
      }),
    });

    const handle = await startUiServer({ port: 0 });
    try {
      const response = await fetch(`${handle.url}/api/campaign/manual`, {
        method: 'POST',
        body: campaignForm(['x']),
      });
      const body = (await response.json()) as {
        results?: Array<{ error?: string; detail?: string }>;
      };

      expect(response.status).toBe(200);
      expect(body.results?.[0]?.error).toBe('selector drift');
      expect(body.results?.[0]?.detail).toContain('https://x.com/compose/post');
      expect(body.results?.[0]?.detail).toContain(fakeScreenshotPath);
      expect(body.results?.[0]?.detail).toContain(fakeDomPath);
    } finally {
      await handle.close();
    }
  });

  it('prunes stale draft files when a new file is uploaded', async () => {
    const uploadDir = path.join(tmpDir, 'uploads', 'draft-image');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, 'stale-a.png'), 'old');
    await fs.writeFile(path.join(uploadDir, 'stale-b.png'), 'old');

    const handle = await startUiServer({ port: 0 });
    try {
      const form = new FormData();
      form.set('kind', 'image');
      form.set('file', new File(['fresh'], 'fresh.png', { type: 'image/png' }));

      const response = await fetch(`${handle.url}/api/draft-file`, {
        method: 'POST',
        body: form,
      });

      expect(response.status).toBe(200);
      const entries = await fs.readdir(uploadDir);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatch(/fresh\.png$/);
    } finally {
      await handle.close();
    }
  });

  it('rejects uploaded files that exceed the 200 MB limit', async () => {
    // Construct a fake File with a large .size without allocating 200 MB.
    const fakeFile = {
      name: 'big.mp4',
      size: 200 * 1024 * 1024 + 1,
      type: 'video/mp4',
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;

    await expect(saveUploadedFile(fakeFile, 'draft-video')).rejects.toThrow(/200 MB/);
  });

  it('preserves uploaded file extensions from MIME type when browser file names are generic', async () => {
    const filePath = await saveUploadedFile(
      new File(['fresh'], 'blob', { type: 'image/png' }),
      'draft-image',
    );

    expect(filePath).toMatch(/blob\.png$/);
  });

  it('exposes manual UI controls and guards live posting', () => {
    expect(REDESIGNED_APP_HTML).toContain('id="manualVerifyTop"');
    expect(REDESIGNED_APP_HTML).toContain('/api/campaign/manual');
    expect(REDESIGNED_APP_HTML).toContain('id="runLog"');
    expect(REDESIGNED_APP_HTML).toContain('id="copyRunLog"');
    expect(REDESIGNED_APP_HTML).toContain('/api/logs');
    expect(REDESIGNED_APP_HTML).toContain("window.confirm('Clear all run logs?");
    expect(REDESIGNED_APP_HTML).toContain('JSON.stringify(runLogEntries');
    expect(REDESIGNED_APP_HTML).toMatch(
      /Promise\.allSettled\(\[\s*refreshAccounts\(\),\s*loadCredentials\(\),\s*refreshStatus\(\),\s*refreshHistory\(\),\s*refreshQueue\(\),\s*refreshRunLogs\(\)\s*\]\)/,
    );
    expect(REDESIGNED_APP_HTML).toContain('window.confirm');
    expect(REDESIGNED_APP_HTML).toContain('data-linkedin-company-id-row');
    expect(REDESIGNED_APP_HTML).toContain("selectedDetailPlatform === 'facebook'");
    expect(REDESIGNED_APP_HTML).toContain('name="typingSpeedPercent"');
    expect(REDESIGNED_APP_HTML).toContain('id="typingSpeedSummary"');
    expect(REDESIGNED_APP_HTML).toContain('name="wordPauseMaxMs"');
    expect(REDESIGNED_APP_HTML).toContain('id="wordPauseSummary"');
    expect(REDESIGNED_APP_HTML).toContain('draftFiles');
    expect(REDESIGNED_APP_HTML).toContain('draftUploadRequests');
    expect(REDESIGNED_APP_HTML).toContain('/api/draft-file');
    expect(REDESIGNED_APP_HTML).toContain('id="clearCompleted"');
    expect(REDESIGNED_APP_HTML).toContain('id="saveQueue"');
    expect(REDESIGNED_APP_HTML).toContain('Local time.');
    expect(REDESIGNED_APP_HTML).not.toContain('Dry run (test without');
    expect(REDESIGNED_APP_HTML).not.toContain('Ready check');
  });

  it('ships a syntactically valid inline UI script', () => {
    const scriptStart = REDESIGNED_APP_HTML.indexOf('<script>');
    const scriptEnd = REDESIGNED_APP_HTML.lastIndexOf('</script>');

    expect(scriptStart).toBeGreaterThanOrEqual(0);
    expect(scriptEnd).toBeGreaterThan(scriptStart);
    expect(
      () => new Function(REDESIGNED_APP_HTML.slice(scriptStart + '<script>'.length, scriptEnd)),
    ).not.toThrow();
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

describe('isForbiddenIp', () => {
  it('blocks loopback IPv4 addresses', () => {
    expect(isForbiddenIp('127.0.0.1')).toBe(true);
    expect(isForbiddenIp('127.255.255.255')).toBe(true);
  });

  it('blocks 0.0.0.0/8', () => {
    expect(isForbiddenIp('0.0.0.0')).toBe(true);
    expect(isForbiddenIp('0.1.2.3')).toBe(true);
  });

  it('blocks private 10.x range', () => {
    expect(isForbiddenIp('10.0.0.1')).toBe(true);
    expect(isForbiddenIp('10.255.255.255')).toBe(true);
  });

  it('blocks private 192.168.x range', () => {
    expect(isForbiddenIp('192.168.0.1')).toBe(true);
    expect(isForbiddenIp('192.168.255.255')).toBe(true);
  });

  it('blocks private 172.16-31.x range', () => {
    expect(isForbiddenIp('172.16.0.1')).toBe(true);
    expect(isForbiddenIp('172.31.255.255')).toBe(true);
    expect(isForbiddenIp('172.15.0.1')).toBe(false);
    expect(isForbiddenIp('172.32.0.1')).toBe(false);
  });

  it('blocks link-local 169.254.x (incl. cloud metadata IP)', () => {
    expect(isForbiddenIp('169.254.169.254')).toBe(true);
    expect(isForbiddenIp('169.254.0.1')).toBe(true);
  });

  it('blocks CGNAT 100.64.0.0/10', () => {
    expect(isForbiddenIp('100.64.0.1')).toBe(true);
    expect(isForbiddenIp('100.127.255.255')).toBe(true);
    expect(isForbiddenIp('100.128.0.1')).toBe(false);
  });

  it('blocks multicast and reserved ranges', () => {
    expect(isForbiddenIp('224.0.0.1')).toBe(true);
    expect(isForbiddenIp('239.255.255.255')).toBe(true);
    expect(isForbiddenIp('240.0.0.1')).toBe(true);
    expect(isForbiddenIp('255.255.255.255')).toBe(true);
  });

  it('allows public IPv4 addresses', () => {
    expect(isForbiddenIp('8.8.8.8')).toBe(false);
    expect(isForbiddenIp('1.1.1.1')).toBe(false);
    expect(isForbiddenIp('93.184.216.34')).toBe(false);
  });

  it('blocks IPv6 loopback and unspecified', () => {
    expect(isForbiddenIp('::1')).toBe(true);
    expect(isForbiddenIp('::')).toBe(true);
  });

  it('blocks IPv6 ULA (fc00::/7)', () => {
    expect(isForbiddenIp('fc00::1')).toBe(true);
    expect(isForbiddenIp('fd12:3456:789a::1')).toBe(true);
  });

  it('blocks IPv6 link-local (fe80::/10)', () => {
    expect(isForbiddenIp('fe80::1')).toBe(true);
    expect(isForbiddenIp('fe80::abcd:ef01')).toBe(true);
  });

  it('blocks IPv6 multicast (ff00::/8)', () => {
    expect(isForbiddenIp('ff02::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 addresses pointing to forbidden IPv4', () => {
    expect(isForbiddenIp('::ffff:127.0.0.1')).toBe(true);
    expect(isForbiddenIp('::ffff:10.0.0.1')).toBe(true);
    expect(isForbiddenIp('::ffff:192.168.1.1')).toBe(true);
  });

  it('allows IPv4-mapped IPv6 for public IPs', () => {
    expect(isForbiddenIp('::ffff:8.8.8.8')).toBe(false);
  });

  it('rejects non-IP strings', () => {
    expect(isForbiddenIp('not-an-ip')).toBe(true);
    expect(isForbiddenIp('localhost')).toBe(true);
  });
});

describe('safeFetchToBuffer URL validation', () => {
  const opts = { maxBytes: 1024 * 1024, timeoutMs: 5000, allowedContentTypes: ['image/'] };

  it('rejects file:// URLs', async () => {
    await expect(safeFetchToBuffer('file:///etc/passwd', opts)).rejects.toThrow(/http or https/i);
  });

  it('rejects gopher:// URLs', async () => {
    await expect(safeFetchToBuffer('gopher://example.com', opts)).rejects.toThrow(/http or https/i);
  });

  it('rejects ftp:// URLs', async () => {
    await expect(safeFetchToBuffer('ftp://example.com/file', opts)).rejects.toThrow(
      /http or https/i,
    );
  });

  it('rejects literal 127.0.0.1', async () => {
    await expect(safeFetchToBuffer('http://127.0.0.1/secret', opts)).rejects.toThrow(/forbidden/i);
  });

  it('rejects literal ::1', async () => {
    await expect(safeFetchToBuffer('http://[::1]/secret', opts)).rejects.toThrow(/forbidden/i);
  });

  it('rejects literal 0.0.0.0', async () => {
    await expect(safeFetchToBuffer('http://0.0.0.0/secret', opts)).rejects.toThrow(/forbidden/i);
  });

  it('rejects literal 10.x private range', async () => {
    await expect(safeFetchToBuffer('http://10.0.0.1/secret', opts)).rejects.toThrow(/forbidden/i);
  });

  it('rejects literal 192.168.x private range', async () => {
    await expect(safeFetchToBuffer('http://192.168.1.1/secret', opts)).rejects.toThrow(
      /forbidden/i,
    );
  });

  it('rejects literal 172.16.x private range', async () => {
    await expect(safeFetchToBuffer('http://172.16.0.1/secret', opts)).rejects.toThrow(/forbidden/i);
  });

  it('rejects AWS/GCP metadata literal IP', async () => {
    await expect(
      safeFetchToBuffer('http://169.254.169.254/latest/meta-data/', opts),
    ).rejects.toThrow(/forbidden/i);
  });

  it('rejects IPv4-mapped IPv6 pointing to loopback', async () => {
    await expect(safeFetchToBuffer('http://[::ffff:127.0.0.1]/secret', opts)).rejects.toThrow(
      /forbidden/i,
    );
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
