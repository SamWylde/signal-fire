import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { countRecent } from '../core/ledger.js';
import { isSessionFresh, readMetadata } from '../core/session.js';
import type { Platform } from '../core/types.js';
import { parseFlags } from './flags.js';

const STATUS_PLATFORMS: Platform[] = [
  'tiktok',
  'x',
  'facebook',
  'linkedin',
  'youtube',
  'instagram',
];

function getRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

async function getAccountsForPlatform(platform: Platform): Promise<string[]> {
  const dir = path.join(getRoot(), 'sessions', platform);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((f) => f.endsWith('.json') && !f.endsWith('.meta.json'))
      .map((f) => f.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

interface StatusRow {
  platform: string;
  account: string;
  session: string;
  lastValidated: string;
  postsPerHour: number;
  postsPerDay: number;
}

async function buildRow(platform: Platform, accountId: string): Promise<StatusRow> {
  const meta = await readMetadata(platform, accountId);

  if (meta === null) {
    return {
      platform,
      account: accountId,
      session: 'none',
      lastValidated: '-',
      postsPerHour: 0,
      postsPerDay: 0,
    };
  }

  const fresh = await isSessionFresh(platform, accountId);
  const postsPerHour = await countRecent(platform, accountId, 'post', 60 * 60 * 1000);
  const postsPerDay = await countRecent(platform, accountId, 'post', 24 * 60 * 60 * 1000);

  // Format lastValidated as local datetime string
  const d = new Date(meta.lastValidated);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastValidated = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  return {
    platform,
    account: accountId,
    session: fresh ? 'fresh' : 'stale',
    lastValidated,
    postsPerHour,
    postsPerDay,
  };
}

function printTable(rows: StatusRow[]): void {
  const headers = ['platform', 'account', 'session', 'last validated', 'posts/hour', 'posts/day'];

  // Column widths: max of header and all row values
  const col = (idx: number, values: string[]) =>
    Math.max((headers[idx] ?? '').length, ...values.map((v) => v.length));

  const cols = [
    col(
      0,
      rows.map((r) => r.platform),
    ),
    col(
      1,
      rows.map((r) => r.account),
    ),
    col(
      2,
      rows.map((r) => r.session),
    ),
    col(
      3,
      rows.map((r) => r.lastValidated),
    ),
    col(
      4,
      rows.map((r) => String(r.postsPerHour)),
    ),
    col(
      5,
      rows.map((r) => String(r.postsPerDay)),
    ),
  ];

  const pad = (s: string, w: number) => s.padEnd(w);

  const header = [
    pad(headers[0] ?? '', cols[0] ?? 0),
    pad(headers[1] ?? '', cols[1] ?? 0),
    pad(headers[2] ?? '', cols[2] ?? 0),
    pad(headers[3] ?? '', cols[3] ?? 0),
    pad(headers[4] ?? '', cols[4] ?? 0),
    pad(headers[5] ?? '', cols[5] ?? 0),
  ].join('  ');

  process.stdout.write(`${header}\n`);

  for (const row of rows) {
    const line = [
      pad(row.platform, cols[0] ?? 0),
      pad(row.account, cols[1] ?? 0),
      pad(row.session, cols[2] ?? 0),
      pad(row.lastValidated, cols[3] ?? 0),
      pad(String(row.postsPerHour), cols[4] ?? 0),
      pad(String(row.postsPerDay), cols[5] ?? 0),
    ].join('  ');
    process.stdout.write(`${line}\n`);
  }
}

export async function runStatus(argv: string[]): Promise<void> {
  let flags: ReturnType<typeof parseFlags>;
  try {
    flags = parseFlags(argv, [
      { name: 'platform', type: 'string' },
      { name: 'account', type: 'string' },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }

  if (flags.help === true) {
    process.stdout.write(
      `signal-fire status [--platform <p>] [--account <id>]\n\nPlatforms: ${STATUS_PLATFORMS.join(', ')}\n`,
    );
    return;
  }

  const platformRaw = typeof flags.platform === 'string' ? flags.platform : undefined;
  if (platformRaw !== undefined && !STATUS_PLATFORMS.includes(platformRaw as Platform)) {
    process.stderr.write(
      `error: unknown platform "${platformRaw}". Valid: ${STATUS_PLATFORMS.join(', ')}\n`,
    );
    process.exit(1);
  }

  const platformFilter = platformRaw as Platform | undefined;
  const accountFilter = typeof flags.account === 'string' ? flags.account : undefined;

  // Build list of (platform, account) pairs to report on
  const pairs: Array<[Platform, string]> = [];

  if (platformFilter !== undefined && accountFilter !== undefined) {
    pairs.push([platformFilter, accountFilter]);
  } else if (platformFilter !== undefined) {
    const accounts = await getAccountsForPlatform(platformFilter);
    for (const acc of accounts) {
      pairs.push([platformFilter, acc]);
    }
    // If no sessions found, still show one row per filter with 'none'
    if (accounts.length === 0) {
      pairs.push([platformFilter, accountFilter ?? '(none)']);
    }
  } else if (accountFilter !== undefined) {
    for (const platform of STATUS_PLATFORMS) {
      pairs.push([platform, accountFilter]);
    }
  } else {
    for (const platform of STATUS_PLATFORMS) {
      const accounts = await getAccountsForPlatform(platform);
      for (const acc of accounts) {
        pairs.push([platform, acc]);
      }
    }
  }

  if (pairs.length === 0) {
    process.stdout.write('No sessions found.\n');
    return;
  }

  const rows = await Promise.all(pairs.map(([p, a]) => buildRow(p, a)));
  printTable(rows);
}
