import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface SafeFetchOptions {
  maxBytes: number;
  timeoutMs?: number;
  allowedContentTypes: string[];
}

/**
 * Returns true if the given IPv4 address string falls within a forbidden CIDR range.
 * Ranges: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12,
 *         192.0.0/24, 192.168/16, 198.18/15, 224/4 (multicast), 240/4 (reserved)
 */
function isForbiddenIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const [a, b, c] = parts.map(Number) as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && (b & 0xc0) === 64) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 multicast
  if (a >= 240) return true; // 240.0.0.0/4 reserved
  return false;
}

/**
 * Returns true if the given IPv6 address is forbidden.
 * Covers ::, ::1, fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast),
 * and IPv4-mapped ::ffff:x.x.x.x (unwrapped and re-checked).
 */
function isForbiddenIPv6(ip: string): boolean {
  // Normalize to lowercase for comparison.
  const lower = ip.toLowerCase();

  // Unspecified and loopback
  if (lower === '::' || lower === '::1') return true;

  // IPv4-mapped: ::ffff:x.x.x.x
  const v4mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4mapped) {
    return isForbiddenIPv4(v4mapped[1] as string);
  }

  // Parse the first 16-bit group to check prefix ranges.
  // Expand leading :: for prefix checks.
  const expanded = expandIPv6(lower);
  if (expanded === null) return true; // can't parse → reject

  const first = expanded[0] as number;
  const firstTwo = ((expanded[0] as number) << 8) | (expanded[1] as number);

  // fc00::/7 — ULA: first byte is 0xfc or 0xfd
  if ((first & 0xfe) === 0xfc) return true;

  // fe80::/10 — link-local: first 10 bits are 1111111010
  if ((firstTwo & 0xffc0) === 0xfe80) return true;

  // ff00::/8 — multicast
  if (first === 0xff) return true;

  return false;
}

/**
 * Expand an IPv6 address string into an array of 16 bytes.
 * Returns null if parsing fails.
 */
function expandIPv6(ip: string): number[] | null {
  // Handle :: expansion
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  function parseGroups(s: string): number[] | null {
    if (s === '') return [];
    const groups = s.split(':');
    const bytes: number[] = [];
    for (const g of groups) {
      const val = Number.parseInt(g, 16);
      if (Number.isNaN(val) || val < 0 || val > 0xffff) return null;
      bytes.push((val >> 8) & 0xff, val & 0xff);
    }
    return bytes;
  }

  if (halves.length === 1) {
    const bytes = parseGroups(halves[0] as string);
    if (bytes === null || bytes.length !== 16) return null;
    return bytes;
  }

  const left = parseGroups(halves[0] as string);
  const right = parseGroups(halves[1] as string);
  if (left === null || right === null) return null;
  const fill = 16 - left.length - right.length;
  if (fill < 0) return null;
  return [...left, ...Array<number>(fill).fill(0), ...right];
}

/**
 * Returns true if the IP (v4 or v6) is in a forbidden range.
 * Exported for unit testing.
 */
export function isForbiddenIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isForbiddenIPv4(ip);
  if (family === 6) return isForbiddenIPv6(ip);
  return true; // not a valid IP — reject
}

/**
 * Resolve a hostname to IP addresses and throw if any is forbidden.
 * For literal IPs, validate directly without DNS.
 */
async function assertHostnameAllowed(hostname: string): Promise<void> {
  const family = isIP(hostname);
  if (family !== 0) {
    // Literal IP — validate directly.
    if (isForbiddenIp(hostname)) {
      throw new Error('URL resolves to a forbidden IP address');
    }
    return;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve hostname');
  }

  if (addresses.length === 0) {
    throw new Error('Could not resolve hostname');
  }

  for (const { address } of addresses) {
    if (isForbiddenIp(address)) {
      throw new Error('URL resolves to a forbidden IP address');
    }
  }
}

/**
 * Fetch a URL safely, guarding against SSRF and memory DoS.
 * - Rejects non-http/https URLs
 * - Blocks requests to private/loopback/metadata IPs (checked after DNS)
 * - Follows up to 5 redirects, re-validating each hop
 * - Enforces a timeout via AbortController
 * - Checks Content-Type against allowedContentTypes prefixes
 * - Rejects bodies exceeding maxBytes (via Content-Length header or streaming)
 */
export async function safeFetchToBuffer(
  rawUrl: string,
  options: SafeFetchOptions,
): Promise<{ buffer: Buffer; contentType: string }> {
  const { maxBytes, timeoutMs = 30_000, allowedContentTypes } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = rawUrl;
    let hops = 0;
    const maxHops = 5;

    while (true) {
      let parsed: URL;
      try {
        parsed = new URL(currentUrl);
      } catch {
        throw new Error('URL must be http or https');
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('URL must be http or https');
      }

      await assertHostnameAllowed(parsed.hostname);

      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
      });

      // Handle redirects manually so we can re-validate each hop.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('Redirect with no Location header');
        if (hops >= maxHops) throw new Error('Too many redirects');
        hops++;
        // Resolve relative redirects against the current URL.
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
      }

      // Content-Type check
      const rawContentType = response.headers.get('content-type') ?? '';
      const contentType = (rawContentType.split(';')[0] ?? '').trim().toLowerCase();
      const allowed = allowedContentTypes.some((prefix) =>
        contentType.startsWith(prefix.toLowerCase()),
      );
      if (!allowed) {
        throw new Error(`Content-Type "${contentType}" is not allowed`);
      }

      // Content-Length pre-check
      const lengthHeader = response.headers.get('content-length');
      if (lengthHeader !== null) {
        const declared = Number.parseInt(lengthHeader, 10);
        if (!Number.isNaN(declared) && declared > maxBytes) {
          throw new Error(
            `Response too large (Content-Length: ${declared} exceeds ${maxBytes} bytes)`,
          );
        }
      }

      // Stream body with size cap
      if (!response.body) {
        throw new Error('Response has no body');
      }

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            controller.abort();
            throw new Error(`Response too large (exceeds ${maxBytes} bytes)`);
          }
          chunks.push(value);
        }
      }

      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      return { buffer, contentType };
    }
  } finally {
    clearTimeout(timer);
  }
}
