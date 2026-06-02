import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCheck } from '../src/cli/check.js';
import type { ComposerProbe, ConnectionCheckDriver } from '../src/core/connection-check.js';
import { setConnectionCheckDriverForTests } from '../src/core/connection-check.js';
import { getSessionPaths, writeMetadata } from '../src/core/session.js';
import type { AccountId, PostingPlatform } from '../src/core/types.js';

// ── Process mock helpers ─────────────────────────────────────────────────────

function mockCliProcess() {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit);
  return { stderr, stdout };
}

// ── Temp SIGNAL_FIRE_HOME ─────────────────────────────────────────────────────

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-cli-check-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(() => {
  vi.restoreAllMocks();
  setConnectionCheckDriverForTests(null);
  if (originalHome === undefined) process.env.SIGNAL_FIRE_HOME = undefined;
  else process.env.SIGNAL_FIRE_HOME = originalHome;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Fake driver factory ───────────────────────────────────────────────────────

const OK_PROBE: ComposerProbe = {
  composer: 'ok',
  checkedSelectors: ['composer.textEditor'],
  missingSelectors: [],
};

function makeFakeDriver(probe?: ComposerProbe): ConnectionCheckDriver {
  return {
    async open() {
      return {
        page: {} as never,
        close: async () => undefined,
      };
    },
    async isLoggedIn() {
      return true;
    },
    async readPageState() {
      return { url: 'https://x.com/home', pageText: 'feed' };
    },
    async probeComposer() {
      return probe ?? OK_PROBE;
    },
  };
}

async function seedProfile(platform: PostingPlatform, accountId: AccountId): Promise<void> {
  await writeMetadata({
    platform,
    accountId,
    mode: 'userDataDir',
    lastValidated: '2025-01-01T00:00:00.000Z',
  });
  fs.mkdirSync(getSessionPaths(platform, accountId).userDataDir, { recursive: true });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runCheck --help', () => {
  it('prints usage and returns without calling core (no exit)', async () => {
    const { stdout } = mockCliProcess();

    // Should NOT throw (no process.exit) when --help is passed
    await expect(runCheck(['--help'])).resolves.toBeUndefined();

    const allOutput = stdout.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toMatch(/signal-fire check/i);
    expect(allOutput).toMatch(/--account/i);
  });

  it('-h also prints usage and returns', async () => {
    const { stdout } = mockCliProcess();

    await expect(runCheck(['-h'])).resolves.toBeUndefined();

    const allOutput = stdout.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toMatch(/signal-fire check/i);
  });
});

describe('runCheck missing/invalid flags', () => {
  it('writes error and exits non-zero when --account is missing', async () => {
    const { stderr } = mockCliProcess();

    await expect(runCheck([])).rejects.toThrow('process.exit:1');

    expect(stderr).toHaveBeenCalledWith('error: --account is required\n');
  });

  it('writes error and exits non-zero for unknown platform', async () => {
    const { stderr } = mockCliProcess();

    await expect(runCheck(['--account', 'main', '--platform', 'myspace'])).rejects.toThrow(
      'process.exit:1',
    );

    const stderrMsg = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrMsg).toMatch(/unknown platform "myspace"/i);
    expect(stderrMsg).toMatch(/valid/i);
  });

  it('writes error and exits non-zero for an unknown flag', async () => {
    const { stderr } = mockCliProcess();

    await expect(runCheck(['--account', 'main', '--bogus', 'value'])).rejects.toThrow(
      'process.exit:1',
    );

    const stderrMsg = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrMsg).toMatch(/error/i);
  });
});

describe('runCheck table output', () => {
  it('outputs platform, account, session, and composer columns for a single platform check', async () => {
    // Seed metadata for account "main" on platform "x" (so the check does not short-circuit as missing_profile)
    await seedProfile('x', 'main');
    setConnectionCheckDriverForTests(makeFakeDriver(OK_PROBE));

    const { stdout } = mockCliProcess();

    await runCheck(['--account', 'main', '--platform', 'x']);

    const allOutput = stdout.mock.calls.map((c) => String(c[0])).join('');
    // Header row
    expect(allOutput).toContain('platform');
    expect(allOutput).toContain('session');
    expect(allOutput).toContain('composer');
    // Data row
    expect(allOutput).toContain('x');
    expect(allOutput).toContain('main');
    // Session and composer values for authenticated + ok probe
    expect(allOutput).toContain('authenticated');
    expect(allOutput).toContain('ok');
  });

  it('outputs missing_profile when no session metadata exists', async () => {
    setConnectionCheckDriverForTests(makeFakeDriver());

    const { stdout } = mockCliProcess();

    // "ghostaccount" has no seeded metadata
    await expect(runCheck(['--account', 'ghostaccount', '--platform', 'x'])).rejects.toThrow(
      'process.exit:1',
    );

    const allOutput = stdout.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('missing_profile');
  });

  it('prints unhealthy rows before exiting non-zero', async () => {
    await seedProfile('x', 'main');
    setConnectionCheckDriverForTests(
      makeFakeDriver({
        composer: 'drifted',
        checkedSelectors: ['composer.textEditor'],
        missingSelectors: ['composer.postButton'],
      }),
    );

    const { stdout } = mockCliProcess();

    await expect(runCheck(['--account', 'main', '--platform', 'x'])).rejects.toThrow(
      'process.exit:1',
    );

    const allOutput = stdout.mock.calls.map((c) => String(c[0])).join('');
    expect(allOutput).toContain('drifted');
    expect(allOutput).toContain('composer.postButton');
  });
});
