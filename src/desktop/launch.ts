import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as string;
const mainPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.js');
const env = { ...process.env };

env.ELECTRON_RUN_AS_NODE = undefined;

const child = spawn(electronPath, [mainPath, ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}
