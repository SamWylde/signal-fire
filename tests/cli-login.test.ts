import { afterEach, describe, expect, it, vi } from 'vitest';

import { runLogin } from '../src/cli/login.js';

function mockCliProcess() {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit);
  return { stderr, stdout };
}

describe('runLogin error paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits when platform is missing', async () => {
    const cli = mockCliProcess();

    await expect(runLogin(['--account', 'main'])).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith('error: --platform is required\n');
  });

  it('exits for unknown platforms', async () => {
    const cli = mockCliProcess();

    await expect(runLogin(['--platform', 'mastodon', '--account', 'main'])).rejects.toThrow(
      'process.exit:1',
    );

    expect(cli.stderr).toHaveBeenCalledWith(
      'error: unknown platform "mastodon". Valid: tiktok, x, facebook, linkedin, youtube, instagram\n',
    );
  });

  it('exits when account is missing', async () => {
    const cli = mockCliProcess();

    await expect(runLogin(['--platform', 'tiktok'])).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith('error: --account is required\n');
  });
});
