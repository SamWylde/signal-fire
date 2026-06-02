import { runConnectionCheck, runConnectionChecks } from '../core/connection-check.js';
import type { ConnectionCheckResult } from '../core/connection-check.js';
import { POSTING_PLATFORMS, type PostingPlatform } from '../core/types.js';
import { parseFlags } from './flags.js';

function printTable(rows: ConnectionCheckResult[]): void {
  const headers = ['platform', 'account', 'session', 'composer', 'detail'];

  const detail = (r: ConnectionCheckResult): string =>
    r.reason ??
    (r.missingSelectors !== undefined ? r.missingSelectors.join(', ') : undefined) ??
    r.evidence ??
    '';

  const col = (idx: number, values: string[]) =>
    Math.max((headers[idx] ?? '').length, ...values.map((v) => v.length));

  const cols = [
    col(
      0,
      rows.map((r) => r.platform),
    ),
    col(
      1,
      rows.map((r) => r.accountId),
    ),
    col(
      2,
      rows.map((r) => r.session),
    ),
    col(
      3,
      rows.map((r) => r.composer),
    ),
    col(
      4,
      rows.map((r) => detail(r)),
    ),
  ];

  const pad = (s: string, w: number) => s.padEnd(w);

  const header = [
    pad(headers[0] ?? '', cols[0] ?? 0),
    pad(headers[1] ?? '', cols[1] ?? 0),
    pad(headers[2] ?? '', cols[2] ?? 0),
    pad(headers[3] ?? '', cols[3] ?? 0),
    pad(headers[4] ?? '', cols[4] ?? 0),
  ].join('  ');

  process.stdout.write(`${header}\n`);

  for (const row of rows) {
    const line = [
      pad(row.platform, cols[0] ?? 0),
      pad(row.accountId, cols[1] ?? 0),
      pad(row.session, cols[2] ?? 0),
      pad(row.composer, cols[3] ?? 0),
      pad(detail(row), cols[4] ?? 0),
    ].join('  ');
    process.stdout.write(`${line}\n`);
  }
}

function isHealthy(row: ConnectionCheckResult): boolean {
  return row.session === 'authenticated' && row.composer === 'ok';
}

export async function runCheck(argv: string[]): Promise<void> {
  let flags: ReturnType<typeof parseFlags>;
  try {
    flags = parseFlags(argv, [
      { name: 'account', type: 'string' },
      { name: 'platform', type: 'string' },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
  }

  if (flags.help === true) {
    process.stdout.write(
      `signal-fire check --account <id> [--platform <p>]\n\nPlatforms: ${POSTING_PLATFORMS.join(', ')}\n`,
    );
    return;
  }

  if (typeof flags.account !== 'string') {
    process.stderr.write('error: --account is required\n');
    process.exit(1);
  }
  const accountId = flags.account;

  const platformRaw = typeof flags.platform === 'string' ? flags.platform : undefined;
  if (
    platformRaw !== undefined &&
    !(POSTING_PLATFORMS as readonly string[]).includes(platformRaw)
  ) {
    process.stderr.write(
      `error: unknown platform "${platformRaw}". Valid: ${POSTING_PLATFORMS.join(', ')}\n`,
    );
    process.exit(1);
  }
  const platform = platformRaw as PostingPlatform | undefined;

  let results: ConnectionCheckResult[];
  if (platform !== undefined) {
    results = [await runConnectionCheck(platform, accountId)];
  } else {
    results = await runConnectionChecks(accountId);
  }

  printTable(results);
  if (!results.every(isHealthy)) {
    process.exit(1);
  }
}
