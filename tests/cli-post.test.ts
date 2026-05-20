import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPost } from '../src/cli/post.js';

function mockCliProcess() {
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit);
  return { stderr, stdout };
}

describe('runPost error paths', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits with guidance when platform is missing', async () => {
    const cli = mockCliProcess();

    await expect(runPost([])).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith('error: --platform is required\n');
  });

  it('exits for unknown platforms', async () => {
    const cli = mockCliProcess();

    await expect(runPost(['--platform', 'mastodon'])).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith(
      'error: unknown platform "mastodon". Valid: tiktok, x, facebook, linkedin, youtube, instagram\n',
    );
  });

  it('exits for explicitly unimplemented platforms', async () => {
    const cli = mockCliProcess();

    await expect(runPost(['--platform', 'threads'])).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith(
      'error: platform "threads" is not yet implemented in the CLI\n',
    );
  });

  it('exits when a platform required flag is missing', async () => {
    const cli = mockCliProcess();

    await expect(runPost(['--platform', 'x', '--account', 'main'])).rejects.toThrow(
      'process.exit:1',
    );

    expect(cli.stderr).toHaveBeenCalledWith('error: --text is required for x\n');
  });

  it('exits before posting when cookies file is unreadable', async () => {
    const cli = mockCliProcess();

    await expect(
      runPost([
        '--platform',
        'x',
        '--account',
        'main',
        '--text',
        'hello',
        '--cookies-file',
        'missing-cookies.json',
      ]),
    ).rejects.toThrow('process.exit:1');

    expect(cli.stderr).toHaveBeenCalledWith(
      'error: --cookies-file file does not exist or is not readable: missing-cookies.json\n',
    );
  });
});
