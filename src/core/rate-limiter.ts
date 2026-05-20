import { readLedger } from './ledger.js';
import type { AccountId, Platform } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface RateLimitConfig {
  perHour?: number;
  perDay?: number;
  perWindow?: { ms: number; max: number };
  actions?: string[];
  excludeNoActionTaken?: boolean;
}

export interface ActionLimits {
  [action: string]: RateLimitConfig;
}

export interface LimitCheckResult {
  withinLimits: boolean;
  breachedAction?: string;
  breachedWindow?: 'hour' | 'day' | 'custom';
  recommendedWaitMs: number;
}

export async function checkLimit(
  platform: Platform,
  accountId: AccountId,
  action: string,
  limits: RateLimitConfig,
  options?: { cooldownMs?: number; countFailed?: boolean },
): Promise<LimitCheckResult> {
  const countFailed = options?.countFailed ?? false;
  const cooldownMs = options?.cooldownMs ?? 0;
  const entries = await readLedger(platform, accountId);
  const now = Date.now();
  const actions = new Set([action, ...(limits.actions ?? [])]);
  const excludeNoActionTaken = limits.excludeNoActionTaken ?? true;

  const relevant = entries.filter(
    (e) =>
      actions.has(e.action) &&
      (countFailed || e.ok) &&
      (!excludeNoActionTaken || e.meta?.noActionTaken !== true),
  );

  function computeWait(windowMs: number, max: number): LimitCheckResult | null {
    const inWindow = relevant.filter((e) => now - e.time < windowMs);
    if (inWindow.length < max) return null;
    // find oldest entry in window
    const oldest = inWindow.reduce(
      (min, e) => (e.time < min ? e.time : min),
      inWindow[0]?.time ?? now,
    );
    const raw = oldest + windowMs - now;
    const recommendedWaitMs = Math.max(0, raw, cooldownMs);
    return { withinLimits: false, recommendedWaitMs };
  }

  if (limits.perHour !== undefined) {
    const result = computeWait(HOUR_MS, limits.perHour);
    if (result !== null) {
      return {
        withinLimits: false,
        breachedAction: action,
        breachedWindow: 'hour',
        recommendedWaitMs: result.recommendedWaitMs,
      };
    }
  }

  if (limits.perDay !== undefined) {
    const result = computeWait(DAY_MS, limits.perDay);
    if (result !== null) {
      return {
        withinLimits: false,
        breachedAction: action,
        breachedWindow: 'day',
        recommendedWaitMs: result.recommendedWaitMs,
      };
    }
  }

  if (limits.perWindow !== undefined) {
    const result = computeWait(limits.perWindow.ms, limits.perWindow.max);
    if (result !== null) {
      return {
        withinLimits: false,
        breachedAction: action,
        breachedWindow: 'custom',
        recommendedWaitMs: result.recommendedWaitMs,
      };
    }
  }

  return { withinLimits: true, recommendedWaitMs: 0 };
}

export async function waitForLimit(
  platform: Platform,
  accountId: AccountId,
  action: string,
  limits: RateLimitConfig,
  options?: { cooldownMs?: number; countFailed?: boolean },
): Promise<number> {
  const result = await checkLimit(platform, accountId, action, limits, options);
  if (result.withinLimits || result.recommendedWaitMs <= 0) return 0;
  await new Promise<void>((resolve) => setTimeout(resolve, result.recommendedWaitMs));
  return result.recommendedWaitMs;
}

export async function checkAllLimits(
  platform: Platform,
  accountId: AccountId,
  limits: ActionLimits,
  action: string,
  options?: { cooldownMs?: number; countFailed?: boolean },
): Promise<LimitCheckResult> {
  const actionLimits = limits[action];
  if (actionLimits === undefined) {
    return { withinLimits: true, recommendedWaitMs: 0 };
  }
  return checkLimit(platform, accountId, action, actionLimits, options);
}
