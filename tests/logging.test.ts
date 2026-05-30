import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger } from '../src/core/logging.js';

afterEach(() => vi.restoreAllMocks());

describe('createLogger', () => {
  it('info writes the expected line to stderr', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createLogger('foo').info('hello');
    expect(spy).toHaveBeenCalledWith('[signal-fire:foo] info: hello\n');
  });

  it('warn joins multiple args with a space', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createLogger('bar').warn('a', 'b');
    expect(spy).toHaveBeenCalledWith('[signal-fire:bar] warn: a b\n');
  });

  it('error formats an Error object including the stack', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    createLogger('baz').error(new Error('boom'));
    const written = spy.mock.calls[0]?.[0] as string;
    expect(written).toContain('[signal-fire:baz] error: Error: boom');
  });
});
