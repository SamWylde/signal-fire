import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ProxyConfig } from './browser.js';
import { uniqueTempPath, withFileLock } from './file-lock.js';

export type { ProxyConfig };

export type ProxyStrategy = 'hash' | 'round_robin';

export interface ProxyPoolConfig {
  pools?: Record<string, string[]>;
  strategy?: ProxyStrategy;
  stateFile?: string;
}

function getRoot(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function interpolateEnv(input: string): string {
  return input.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name: string) => process.env[name] ?? '');
}

export function isNoProxySpecifier(input: string | undefined): boolean {
  if (input === undefined) return true;
  const normalized = input.trim().toLowerCase();
  return (
    normalized === '' || normalized === 'none' || normalized === 'null' || normalized === 'false'
  );
}

export function parseProxyUrl(url: string): ProxyConfig | undefined {
  try {
    const u = new URL(url);
    const server = `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`;
    const out: ProxyConfig = { server };
    if (u.username) out.username = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    return out;
  } catch {
    return undefined;
  }
}

export class ProxyPool {
  private readonly pools: Record<string, string[]>;
  private readonly strategy: ProxyStrategy;
  private readonly stateFile: string;

  constructor(config?: ProxyPoolConfig) {
    this.pools = config?.pools ?? {};
    this.strategy = config?.strategy ?? 'hash';
    this.stateFile = config?.stateFile ?? path.join(getRoot(), 'proxy-pool-state.json');
  }

  async resolve(
    specifier: string | undefined,
    accountId?: string,
  ): Promise<ProxyConfig | undefined> {
    if (specifier === undefined || isNoProxySpecifier(specifier)) return undefined;
    const normalizedSpecifier = specifier.trim();

    if (normalizedSpecifier.startsWith('pool:')) {
      const poolName = normalizedSpecifier.slice(5);
      const pool = this.pools[poolName];
      if (!pool || pool.length === 0) {
        throw new Error(`Proxy pool "${poolName}" not found or empty`);
      }

      let choice: string;
      if (this.strategy === 'round_robin') {
        choice = await withFileLock(`${this.stateFile}.lock`, async () => {
          const state = await this.loadState();
          const idx = (state[poolName] ?? 0) % pool.length;
          const selected = pool[idx] as string;
          state[poolName] = (idx + 1) % pool.length;
          await this.saveState(state);
          return selected;
        });
      } else {
        const idx = accountId !== undefined ? fnv1a(accountId) % pool.length : 0;
        choice = pool[idx] as string;
      }

      const interpolatedChoice = interpolateEnv(choice);
      if (isNoProxySpecifier(interpolatedChoice)) return undefined;
      return parseProxyUrl(interpolatedChoice);
    }

    const interpolatedSpecifier = interpolateEnv(normalizedSpecifier);
    if (isNoProxySpecifier(interpolatedSpecifier)) return undefined;
    return parseProxyUrl(interpolatedSpecifier);
  }

  private async loadState(): Promise<Record<string, number>> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private async saveState(state: Record<string, number>): Promise<void> {
    const tmpPath = uniqueTempPath(this.stateFile);
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmpPath, this.stateFile);
  }
}
