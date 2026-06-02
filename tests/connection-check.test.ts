import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBlockRecord, writeBlockRecord } from '../src/core/blocks.js';
import type { Page } from '../src/core/browser.js';
import {
  type ComposerProbe,
  type ConnectionCheckDriver,
  classifySessionFromPage,
  runConnectionCheck,
  runConnectionChecks,
  setConnectionCheckDriverForTests,
} from '../src/core/connection-check.js';
import { getSessionPaths, readMetadata, writeMetadata } from '../src/core/session.js';
import type { AccountId, Platform, PostingPlatform } from '../src/core/types.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

const OK_PROBE: ComposerProbe = { composer: 'ok', checkedSelectors: ['a'], missingSelectors: [] };

interface FakeDriverConfig {
  loggedIn?: boolean;
  url?: string;
  pageText?: string;
  probe?: ComposerProbe;
  throwOn?: 'open' | 'isLoggedIn' | 'probe';
}

function makeFakeDriver(config: FakeDriverConfig) {
  const calls = { open: 0, isLoggedIn: 0, probe: 0, close: 0 };
  const driver: ConnectionCheckDriver = {
    async open() {
      calls.open += 1;
      if (config.throwOn === 'open') throw new Error('launch failed');
      return {
        page: {} as Page,
        close: async () => {
          calls.close += 1;
        },
      };
    },
    async isLoggedIn() {
      calls.isLoggedIn += 1;
      if (config.throwOn === 'isLoggedIn') throw new Error('isLoggedIn failed');
      return config.loggedIn ?? false;
    },
    async readPageState() {
      return { url: config.url ?? '', pageText: config.pageText ?? '' };
    },
    async probeComposer() {
      calls.probe += 1;
      if (config.throwOn === 'probe') throw new Error('probe failed');
      return config.probe ?? OK_PROBE;
    },
  };
  return { driver, calls };
}

async function seedProfile(platform: Platform, accountId: AccountId, lastValidated: string) {
  await writeMetadata({ platform, accountId, mode: 'userDataDir', lastValidated });
  fs.mkdirSync(getSessionPaths(platform, accountId).userDataDir, { recursive: true });
}

const OLD_ISO = '2020-01-01T00:00:00.000Z';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-conncheck-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(() => {
  setConnectionCheckDriverForTests(null);
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('classifySessionFromPage (pure)', () => {
  it('returns authenticated when logged in', () => {
    expect(classifySessionFromPage({ loggedIn: true, url: '', pageText: '' }).session).toBe(
      'authenticated',
    );
  });

  it('classifies challenge text before trusting a logged-in cookie signal', () => {
    const r = classifySessionFromPage({
      loggedIn: true,
      url: 'https://facebook.com/checkpoint',
      pageText: 'Please verify your account to continue',
    });
    expect(r.session).toBe('challenge_required');
  });

  it('classifies a captcha/checkpoint as challenge_required with evidence', () => {
    const r = classifySessionFromPage({
      loggedIn: false,
      url: 'https://x.com/account/access',
      pageText: 'Please verify your account to continue',
    });
    expect(r.session).toBe('challenge_required');
    expect(r.evidence).toContain('verify your account');
  });

  it('classifies a throttle message as soft_block', () => {
    const r = classifySessionFromPage({
      loggedIn: false,
      url: 'https://instagram.com/',
      pageText: 'Please try again later',
    });
    expect(r.session).toBe('soft_block');
  });

  it('classifies a login redirect as logged_out', () => {
    const r = classifySessionFromPage({
      loggedIn: false,
      url: 'https://x.com/i/flow/login',
      pageText: '',
    });
    expect(r.session).toBe('logged_out');
  });

  it('defaults to logged_out when not logged in and no block signal', () => {
    expect(
      classifySessionFromPage({ loggedIn: false, url: 'https://x.com/home', pageText: 'feed' })
        .session,
    ).toBe('logged_out');
  });
});

describe('runConnectionCheck orchestration', () => {
  it('returns missing_profile without launching a browser', async () => {
    const { driver, calls } = makeFakeDriver({ loggedIn: true });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'noaccount');

    expect(result.session).toBe('missing_profile');
    expect(result.composer).toBe('skipped');
    expect(calls.open).toBe(0); // never launched
  });

  it('returns missing_profile without launching when metadata exists but profile dir is absent', async () => {
    await writeMetadata({
      platform: 'x',
      accountId: 'main',
      mode: 'userDataDir',
      lastValidated: OLD_ISO,
    });
    const { driver, calls } = makeFakeDriver({ loggedIn: true });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('missing_profile');
    expect(result.composer).toBe('skipped');
    expect(calls.open).toBe(0);
  });

  it('returns quarantined (read-only) without launching when a quarantine is active', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    await writeBlockRecord({
      platform: 'x',
      accountId: 'main',
      state: 'quarantined',
      consecutiveSoftBlocks: 1,
      quarantinedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      reason: 'prior block',
    });
    const { driver, calls } = makeFakeDriver({ loggedIn: true });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('quarantined');
    expect(calls.open).toBe(0);
  });

  it('does not clear an expired quarantine record while running a read-only check', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    const expiredUntil = new Date(Date.now() - 60 * 1000).toISOString();
    await writeBlockRecord({
      platform: 'x',
      accountId: 'main',
      state: 'quarantined',
      consecutiveSoftBlocks: 1,
      quarantinedUntil: expiredUntil,
      reason: 'old block',
    });
    const { driver, calls } = makeFakeDriver({ loggedIn: true });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('authenticated');
    expect(calls.open).toBe(1);
    expect(await readBlockRecord('x', 'main')).toMatchObject({
      state: 'quarantined',
      quarantinedUntil: expiredUntil,
      reason: 'old block',
    });
  });

  it('authenticated + ok updates lastValidated and runs the composer probe', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    const { driver, calls } = makeFakeDriver({ loggedIn: true, probe: OK_PROBE });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('authenticated');
    expect(result.composer).toBe('ok');
    expect(calls.probe).toBe(1);
    expect(calls.close).toBe(1);
    const meta = await readMetadata('x', 'main');
    expect(meta).not.toBeNull();
    // lastValidated is only written on live auth success, so it should advance.
    expect(new Date(meta?.lastValidated ?? OLD_ISO).getTime()).toBeGreaterThan(
      new Date(OLD_ISO).getTime(),
    );
  });

  it('logged_out does NOT update lastValidated, does NOT probe, and writes NO block record', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    const { driver, calls } = makeFakeDriver({
      loggedIn: false,
      url: 'https://x.com/i/flow/login',
    });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('logged_out');
    expect(result.composer).toBe('skipped');
    expect(calls.probe).toBe(0);
    expect(calls.close).toBe(1);
    // Old metadata must NOT count as live health — lastValidated stays put.
    const meta = await readMetadata('x', 'main');
    expect(meta?.lastValidated).toBe(OLD_ISO);
    // An ordinary expired session must never create a block record.
    expect(await readBlockRecord('x', 'main')).toBeNull();
  });

  it('challenge_required is read-only and writes no block record', async () => {
    await seedProfile('facebook', 'main', OLD_ISO);
    const { driver } = makeFakeDriver({
      loggedIn: false,
      url: 'https://facebook.com/checkpoint',
      pageText: 'We detected unusual activity',
    });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('facebook', 'main');

    expect(result.session).toBe('challenge_required');
    expect(await readBlockRecord('facebook', 'main')).toBeNull();
  });

  it('does not update lastValidated or probe when challenge text appears with a logged-in signal', async () => {
    await seedProfile('facebook', 'main', OLD_ISO);
    const { driver, calls } = makeFakeDriver({
      loggedIn: true,
      url: 'https://facebook.com/checkpoint',
      pageText: 'We detected unusual activity',
    });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('facebook', 'main');

    expect(result.session).toBe('challenge_required');
    expect(result.composer).toBe('skipped');
    expect(calls.probe).toBe(0);
    expect((await readMetadata('facebook', 'main'))?.lastValidated).toBe(OLD_ISO);
  });

  it('a composer-probe failure does not downgrade an authenticated session', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    const { driver, calls } = makeFakeDriver({ loggedIn: true, throwOn: 'probe' });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('authenticated');
    expect(result.composer).toBe('unknown');
    expect(calls.close).toBe(1);
  });

  it('returns unknown and still closes when the browser fails to open', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    const { driver } = makeFakeDriver({ throwOn: 'open' });
    setConnectionCheckDriverForTests(driver);

    const result = await runConnectionCheck('x', 'main');

    expect(result.session).toBe('unknown');
    expect(result.composer).toBe('unknown');
  });
});

describe('runConnectionChecks', () => {
  it('checks each requested platform in order', async () => {
    await seedProfile('x', 'main', OLD_ISO);
    await seedProfile('facebook', 'main', OLD_ISO);
    const { driver } = makeFakeDriver({ loggedIn: true });
    setConnectionCheckDriverForTests(driver);

    const platforms: PostingPlatform[] = ['x', 'facebook'];
    const rows = await runConnectionChecks('main', platforms);

    expect(rows.map((r) => r.platform)).toEqual(['x', 'facebook']);
    expect(rows.every((r) => r.session === 'authenticated')).toBe(true);
  });
});
