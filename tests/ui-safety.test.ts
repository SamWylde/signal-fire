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

  it('forces dryRun on manual campaign inputs for the verified platforms', () => {
    const form = campaignForm(['x']);
    form.set('typingSpeedPercent', '300');
    const assets = { imagePath: 'C:\\tmp\\image.jpg' };

    for (const platform of ['x', 'facebook', 'linkedin', 'instagram'] as const) {
      const input = buildManualCampaignInput(platform, form, assets) as {
        dryRun?: boolean;
        typingSpeedMultiplier?: number;
      };
      expect(input.dryRun).toBe(true);
      if (platform !== 'facebook') expect(input.typingSpeedMultiplier).toBe(3);
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

  it('uses saved draft image paths when the file input is empty after reopening', async () => {
    const uploadDir = path.join(tmpDir, 'uploads', 'draft-image');
    const imagePath = path.join(uploadDir, 'logo.png');
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(imagePath, 'fake-image');

    const composed: Array<{ platform: string; input: { dryRun?: boolean; imagePath?: string } }> =
      [];
    setManualVerifyDriverForTests({
      launch: async () => ({
        context: {
          pages: () => [{}],
          newPage: async () => ({}),
          on: () => undefined,
        } as never,
        close: async () => undefined,
      }),
      isLoggedIn: async () => true,
      compose: async (platform, _page, input) => {
        composed.push({ platform, input: input as { dryRun?: boolean; imagePath?: string } });
      },
      markValidated: async () => undefined,
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
      expect(composed[0]?.input).toMatchObject({ imagePath, dryRun: true });
    } finally {
      await handle.close();
    }
  });

  it('records debug artifact paths when manual preparation fails', async () => {
    const page = {
      url: () => 'https://x.com/compose/post',
      screenshot: async (options: { path: string }) => {
        await fs.writeFile(options.path, 'fake-png');
      },
      content: async () =>
        '<html><script>secret()</script><body><div>Compose failed</div></body></html>',
    };

    setManualVerifyDriverForTests({
      launch: async () => ({
        context: {
          pages: () => [page],
          newPage: async () => page,
          on: () => undefined,
        } as never,
        close: async () => undefined,
      }),
      isLoggedIn: async () => true,
      compose: async () => {
        throw new Error('selector drift');
      },
      markValidated: async () => undefined,
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
      expect(body.results?.[0]?.detail).toContain(path.join(tmpDir, 'ui', 'debug'));

      const debugFiles = await fs.readdir(path.join(tmpDir, 'ui', 'debug'));
      expect(debugFiles.some((file) => file.endsWith('.png'))).toBe(true);
      const domFile = debugFiles.find((file) => file.endsWith('.txt'));
      expect(domFile).toBeDefined();
      if (domFile !== undefined) {
        const domText = await fs.readFile(path.join(tmpDir, 'ui', 'debug', domFile), 'utf8');
        expect(domText).toContain('Compose failed');
        expect(domText).not.toContain('secret()');
      }
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
    expect(REDESIGNED_APP_HTML).toContain('id="checkForm"');
    expect(REDESIGNED_APP_HTML).toContain('data-linkedin-company-id-row');
    expect(REDESIGNED_APP_HTML).toContain("selectedDetailPlatform === 'facebook'");
    expect(REDESIGNED_APP_HTML).toContain('name="typingSpeedPercent"');
    expect(REDESIGNED_APP_HTML).toContain('id="typingSpeedSummary"');
    expect(REDESIGNED_APP_HTML).toContain('draftFiles');
    expect(REDESIGNED_APP_HTML).toContain('draftUploadRequests');
    expect(REDESIGNED_APP_HTML).toContain('/api/draft-file');
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
