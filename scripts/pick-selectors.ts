/**
 * Selector Picker Tool
 *
 * Launches a Patchright browser with the user's logged-in profile and injects
 * a visual overlay so you can hover-and-click elements to generate selectors.
 * Picked selectors are saved to ~/.signal-fire/picks/<timestamp>-<host>.json
 * via a local HTTP server.
 *
 * Usage:
 *   pnpm pick-selectors -- --account <accountId> [--url <url>] [--spoof-fingerprint]
 */

import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'patchright';
import type { BrowserContext } from 'patchright';

import { applyFingerprintEvasions } from '../src/core/evasions/index.js';
import {
  chromeMajorFromUA,
  loadOrCreateFingerprint,
  registerChromeMajorDetector,
} from '../src/core/fingerprint.js';
import { getSessionPaths } from '../src/core/session.js';

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): { accountId: string; url: string } {
  const args = process.argv.slice(2);
  let accountId: string | undefined;
  let url = 'about:blank';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--account' && args[i + 1] !== undefined) {
      accountId = args[i + 1];
      i++;
    } else if (arg === '--url' && args[i + 1] !== undefined) {
      url = args[i + 1] as string;
      i++;
    }
  }

  if (accountId === undefined || accountId.trim().length === 0) {
    console.error('Error: --account <accountId> is required.');
    console.error('Usage: pnpm pick-selectors -- --account <accountId> [--url <url>]');
    process.exit(1);
  }

  return { accountId: accountId.trim(), url };
}

// ---------------------------------------------------------------------------
// Chrome detection (mirrors audit-selectors.ts)
// ---------------------------------------------------------------------------

let loggedChromeDetection = false;

function chromeExecutableCandidates(): string[] {
  return [
    path.join(process.env.ProgramFiles ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] ?? '',
      'Google',
      'Chrome',
      'Application',
      'chrome.exe',
    ),
    path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter((p) => p.length > 'chrome.exe'.length);
}

function findChromeExecutable(): string | null {
  const candidates = chromeExecutableCandidates();
  let found: string | undefined;
  const results: Array<{ path: string; exists: boolean }> = [];
  for (const candidate of candidates) {
    try {
      const exists = fsSync.existsSync(candidate);
      results.push({ path: candidate, exists });
      if (exists && found === undefined) found = candidate;
    } catch {
      results.push({ path: candidate, exists: false });
    }
  }
  const chromePath = found ?? null;
  if (!loggedChromeDetection) {
    loggedChromeDetection = true;
    process.stderr.write(
      `[signal-fire] Chrome detection: ${chromePath === null ? 'NOT FOUND' : chromePath}\n`,
    );
  }
  return chromePath;
}

function chromeMajorFromVersion(version: string | null): number | null {
  if (version === null) return null;
  const match = version.match(/^(\d+)\./);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isNaN(n) ? null : n;
}

function getInstalledChromeVersion(): string | null {
  const executablePath = findChromeExecutable();
  if (executablePath === null) return null;
  try {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    const output = execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      timeout: 1500,
      windowsHide: true,
    });
    return (output as string).match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function chromeUserAgent(chromeMajor: number): string {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
}

function cliSpoofFingerprintEnabled(): boolean {
  const args = process.argv.slice(2);
  return args.includes('--spoof-fingerprint') || args.includes('--enable-stealth-fingerprint');
}

// ---------------------------------------------------------------------------
// Browser launch
// ---------------------------------------------------------------------------

const BASE_LAUNCH_ARGS = ['--mute-audio'] as const;
const IGNORE_DEFAULT_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--enable-automation',
] as const;

async function launchPickerBrowser(accountId: string): Promise<BrowserContext> {
  if (findChromeExecutable() === null) {
    throw new Error(
      'Google Chrome is required.\nInstall Chrome from https://www.google.com/chrome and restart.',
    );
  }

  const spoofFingerprint = cliSpoofFingerprintEnabled();
  const normalizedFingerprint = spoofFingerprint
    ? await (async () => {
        registerChromeMajorDetector(async () =>
          chromeMajorFromVersion(getInstalledChromeVersion()),
        );
        const fingerprint = await loadOrCreateFingerprint(accountId);
        const detectedMajor = chromeMajorFromVersion(getInstalledChromeVersion());
        const persistedMajor = chromeMajorFromUA(fingerprint.userAgent);
        return detectedMajor !== null && persistedMajor !== detectedMajor
          ? { ...fingerprint, userAgent: chromeUserAgent(detectedMajor) }
          : fingerprint;
      })()
    : undefined;

  const paths = getSessionPaths('linkedin', accountId);
  const userDataDir = paths.userDataDir;

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      chromiumSandbox: true,
      ignoreDefaultArgs: [...IGNORE_DEFAULT_ARGS],
      args: [...BASE_LAUNCH_ARGS],
      acceptDownloads: false,
      viewport: null,
      ...(normalizedFingerprint !== undefined && {
        locale: normalizedFingerprint.locale,
        timezoneId: normalizedFingerprint.timezoneId,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('user data directory is already in use') ||
      msg.includes('already being used') ||
      msg.includes('SingletonLock') ||
      msg.includes('DevToolsActivePort')
    ) {
      throw new Error(
        `The app appears to be running with this account's profile. Close the app and retry.\n(${msg})`,
      );
    }
    throw err;
  }

  await applyFingerprintEvasions(context, { fingerprint: normalizedFingerprint, spoofFingerprint });
  return context;
}

// ---------------------------------------------------------------------------
// Free port finder
// ---------------------------------------------------------------------------

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => {
        if (addr !== null && typeof addr === 'object') {
          resolve(addr.port);
        } else {
          reject(new Error('Could not determine free port'));
        }
      });
    });
    srv.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Picks persistence
// ---------------------------------------------------------------------------

interface PickMetadata {
  tag: string;
  text: string;
  aria: string | null;
  classNames: string[];
  boundingRect: { x: number; y: number; w: number; h: number };
}

interface PickEntry {
  intent: string;
  primarySelector: string;
  candidates: string[];
  metadata: PickMetadata;
}

interface PicksPayload {
  url: string;
  accountId: string;
  timestamp: string;
  picks: PickEntry[];
}

function getSignalFireRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

async function writePicks(payload: PicksPayload): Promise<string> {
  const dir = path.join(getSignalFireRoot(), 'picks');
  await fs.mkdir(dir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  let host: string;
  try {
    host = new URL(payload.url).hostname.replace(/[^a-z0-9-]/gi, '_') || 'unknown';
  } catch {
    host = 'unknown';
  }
  const filename = `${ts}-${host}.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

// ---------------------------------------------------------------------------
// HTTP save server
// ---------------------------------------------------------------------------

function startSaveServer(port: number): http.Server {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/save') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let parsed: PicksPayload;
        try {
          parsed = JSON.parse(body) as PicksPayload;
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid JSON: ${String(err)}` }));
          return;
        }
        writePicks(parsed)
          .then((filePath) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ path: filePath }));
            console.log('[picker] Saved picks to:', filePath);
          })
          .catch((err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          });
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, '127.0.0.1');
  return server;
}

// ---------------------------------------------------------------------------
// Overlay injection
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildOverlayScript(port: number, accountId: string): string {
  const overlayPath = path.join(__dirname, 'picker-overlay.js');
  let script = fsSync.readFileSync(overlayPath, 'utf8');
  script = script.replace(/'__SF_PICKER_PORT__'/, String(port));
  // Inject accountId so the overlay can include it in the saved payload
  script = script.replace(
    /var PICKER_PORT = /,
    `window.__SF_ACCOUNT_ID__ = ${JSON.stringify(accountId)};\n  var PICKER_PORT = `,
  );
  return script;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { accountId, url } = parseArgs();

  console.log('\nsignal-fire selector picker');
  console.log(`  Account: ${accountId}`);
  console.log(`  URL    : ${url}`);

  const port = await getFreePort();
  console.log(`  Port   : ${port}`);

  const server = startSaveServer(port);

  const context = await launchPickerBrowser(accountId);

  // Inject overlay before navigation so it runs on every page
  const overlayScript = buildOverlayScript(port, accountId);
  await context.addInitScript({ content: overlayScript });

  const page = context.pages()[0] ?? (await context.newPage());

  if (url !== 'about:blank') {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch((err: unknown) => {
      console.warn(
        '[picker] Navigation warning:',
        err instanceof Error ? err.message : String(err),
      );
    });
  }

  console.log('\n--- Picker active ---');
  console.log('Hover elements to highlight them. Click to pick. Use the panel to save.');
  console.log('Close the browser or press Ctrl+C to exit.');

  // Stay alive until browser is closed or Ctrl+C
  await new Promise<void>((resolve) => {
    context.on('close', () => {
      resolve();
    });

    process.on('SIGINT', () => {
      context
        .close()
        .catch(() => undefined)
        .finally(resolve);
    });

    process.on('SIGTERM', () => {
      context
        .close()
        .catch(() => undefined)
        .finally(resolve);
    });
  });

  server.close();
  console.log('[picker] Done.');
}

main().catch((err) => {
  console.error('Picker failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
