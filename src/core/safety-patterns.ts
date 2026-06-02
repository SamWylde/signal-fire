// Shared, side-effect-free phrase matching for platform safety signals (captchas,
// checkpoints, rate limits, temporary blocks). Lives in core so both the UI campaign
// flow and the read-only connection health-check can classify the same signals without
// the core depending on the UI layer.

/** Identity / verification challenges — the account is blocked pending human action. */
export const CHALLENGE_PATTERNS = [
  'captcha',
  'challenge',
  'checkpoint',
  'suspicious',
  'unusual activity',
  'verify your account',
] as const;

/** Soft / temporary blocks — throttling the account, usually clears on its own. */
export const SOFT_BLOCK_PATTERNS = [
  'action blocked',
  'rate limit',
  'rate-limit',
  'temporarily blocked',
  'try again later',
  'we limit how often',
] as const;

/**
 * The full set of phrases that should stop a campaign. Kept as the union of the two
 * buckets above so existing campaign-stop behavior is unchanged.
 */
export const SAFETY_STOP_PATTERNS = [...CHALLENGE_PATTERNS, ...SOFT_BLOCK_PATTERNS] as const;

export function shouldStopCampaignAfterError(error: string): boolean {
  const normalized = error.toLowerCase();
  return SAFETY_STOP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Classify a block signal found in page text/URL into the same vocabulary used by
 * `BlockState`. Returns the matched phrase as evidence, or null when nothing matches.
 * Challenges take precedence over soft blocks. Pure — never writes anything.
 */
export function classifyBlockSignal(
  text: string,
): { state: 'challenge_required' | 'soft_block'; phrase: string } | null {
  const normalized = text.toLowerCase();
  for (const phrase of CHALLENGE_PATTERNS) {
    if (normalized.includes(phrase)) return { state: 'challenge_required', phrase };
  }
  for (const phrase of SOFT_BLOCK_PATTERNS) {
    if (normalized.includes(phrase)) return { state: 'soft_block', phrase };
  }
  return null;
}
