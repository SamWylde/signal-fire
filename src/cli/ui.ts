import { startUiServer } from '../ui/server.js';
import { parseFlags } from './flags.js';

function parsePort(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('--port must be a number between 1 and 65535');
  }
  return port;
}

export async function runUi(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, [
    { name: 'host', type: 'string' },
    { name: 'port', type: 'string' },
  ]);

  if (flags.help === true) {
    process.stdout.write('signal-fire ui [--host <host>] [--port <port>]\n');
    return;
  }

  const host = typeof flags.host === 'string' ? flags.host : undefined;
  const port = parsePort(flags.port);
  const handle = await startUiServer({
    ...(host !== undefined && { host }),
    ...(port !== undefined && { port }),
  });

  process.stdout.write(`Signal Fire UI running at ${handle.url}\n`);
  await new Promise<void>((resolve) => {
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      handle
        .close()
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`error: failed to close UI server: ${message}\n`);
        })
        .finally(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
