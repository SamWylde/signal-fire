import { format } from 'node:util';

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Creates a stderr diagnostic logger that prints `[signal-fire:<scope>] <level>: <message>`. */
export function createLogger(scope: string): Logger {
  const write = (level: 'info' | 'warn' | 'error', args: unknown[]): void => {
    process.stderr.write(`[signal-fire:${scope}] ${level}: ${format(...args)}\n`);
  };
  return {
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
  };
}
