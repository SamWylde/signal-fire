import { describe, expect, it } from 'vitest';
import { parseFlags } from '../src/cli/flags.js';

describe('parseFlags', () => {
  it('parses string flags', () => {
    const result = parseFlags(
      ['--account', 'main', '--video', 'foo.mp4'],
      [
        { name: 'account', type: 'string' },
        { name: 'video', type: 'string' },
      ],
    );
    expect(result).toEqual({ account: 'main', video: 'foo.mp4' });
  });

  it('parses boolean flags', () => {
    const result = parseFlags(['--headed'], [{ name: 'headed', type: 'boolean' }]);
    expect(result).toEqual({ headed: true });
  });

  it('parses repeated array flags', () => {
    const result = parseFlags(['--tags', 'a', '--tags', 'b'], [{ name: 'tags', type: 'array' }]);
    expect(result).toEqual({ tags: ['a', 'b'] });
  });

  it('throws on unknown flag', () => {
    expect(() => parseFlags(['--unknown', 'x'], [])).toThrow('Unknown flag: --unknown');
  });

  it('throws with usage guidance on positional arguments', () => {
    expect(() => parseFlags(['orphan'], [])).toThrow(
      'Unexpected positional argument: orphan. Use --help for usage',
    );
  });

  it('returns { help: true } immediately when --help appears', () => {
    const result = parseFlags(['--help'], []);
    expect(result).toEqual({ help: true });
  });

  it('returns { help: true } immediately when -h appears', () => {
    const result = parseFlags(['-h'], []);
    expect(result).toEqual({ help: true });
  });

  it('throws when a string flag has no value (next token is another flag)', () => {
    expect(() =>
      parseFlags(
        ['--account', '--video'],
        [
          { name: 'account', type: 'string' },
          { name: 'video', type: 'string' },
        ],
      ),
    ).toThrow('Flag --account requires a value');
  });

  it('does not consume -h as a string flag value', () => {
    expect(() => parseFlags(['--platform', '-h'], [{ name: 'platform', type: 'string' }])).toThrow(
      'Flag --platform requires a value',
    );
  });
});
