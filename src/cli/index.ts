#!/usr/bin/env node
import { runLogin } from './login.js';
// signal-fire CLI entry point
import { runPost } from './post.js';
import { runStatus } from './status.js';
import { runUi } from './ui.js';

function usage(stream: NodeJS.WritableStream = process.stdout): void {
  stream.write(`signal-fire - multi-platform posting CLI

Usage:
  signal-fire post --platform <p> --account <id> [platform flags]
  signal-fire login --platform <p> --account <id>
  signal-fire status [--platform <p>] [--account <id>]
  signal-fire ui [--port <port>]
  signal-fire help

Posting platforms: tiktok, x, facebook, linkedin, youtube, instagram

Run 'signal-fire post --platform <p> --help' for per-platform flags.
`);
}

const command = process.argv[2];
const rest = process.argv.slice(3);

try {
  switch (command) {
    case 'post':
      await runPost(rest);
      break;
    case 'login':
      await runLogin(rest);
      break;
    case 'status':
      await runStatus(rest);
      break;
    case 'ui':
      await runUi(rest);
      break;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      usage();
      process.exit(0);
      break;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      usage(process.stderr);
      process.exit(1);
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(2);
}
