import { type Locator, type Page, isLocatorVisible } from './browser.js';
import {
  getMousePosition,
  humanClick as humanMouseClick,
  humanMove,
  humanScroll,
} from './mouse.js';
export { selectAllShortcut, sleep } from './timing.js';
import { selectAllShortcut, sleep } from './timing.js';

// --- Timing ---

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function jitterSleep(ms: number, deviation = 1): Promise<void> {
  const factor = 1 + Math.random() * deviation;
  return sleep(ms * factor);
}

export async function dwell(opts?: {
  minMs?: number;
  maxMs?: number;
  microMouseProb?: number;
  page?: Page;
}): Promise<void> {
  const minMs = opts?.minMs ?? 200;
  const maxMs = opts?.maxMs ?? 2000;
  const duration = randomFloat(minMs, Math.max(minMs, maxMs));

  if (opts?.page !== undefined && Math.random() < (opts.microMouseProb ?? 0.25)) {
    const current = getMousePosition(opts.page);
    const distance = randomFloat(3, 8);
    const angle = randomFloat(0, Math.PI * 2);
    await humanMove(
      opts.page,
      {
        x: current.x + Math.cos(angle) * distance,
        y: current.y + Math.sin(angle) * distance,
      },
      { overshootProb: 0, targetWidth: 8 },
    ).catch(() => undefined);
  }

  await sleep(duration);
}

export async function humanScrollEased(
  page: Page,
  deltaY: number,
  opts?: { durationMs?: number; steps?: number },
): Promise<void> {
  await humanScroll(
    page,
    { x: 0, y: deltaY },
    {
      ...(opts?.durationMs !== undefined && { easingMs: opts.durationMs }),
      ...(opts?.steps !== undefined && { steps: opts.steps }),
    },
  );
}

// --- Typing ---

export interface HumanTypeOptions {
  delayRange?: [number, number];
  thinkProbability?: number;
  thinkRange?: [number, number];
  clearFirst?: boolean;
  /**
   * @deprecated Natural cadence is now the only typing behavior. This option is ignored
   * and kept only so older call sites can continue passing { naturalCadence: true }.
   */
  naturalCadence?: boolean;
  /**
   * Higher values type faster. 1 is the current default cadence, 2 is twice as fast.
   */
  typingSpeedMultiplier?: number;
  /** Maximum inter-word pause in ms at 1× multiplier. Defaults to 40. */
  wordPauseMaxMs?: number;
  rng?: () => number;
}

export type HumanTypingStepKind = 'word' | 'space' | 'punctuation' | 'linebreak' | 'symbol';

export interface HumanTypingStep {
  text: string;
  keyDelayMs: number;
  keyDelayMsByChar: number[];
  delayAfterMs: number;
  kind: HumanTypingStepKind;
}

const TYPING_SPEED_FACTOR = 0.5625;

function randomFromRange(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

function defaultRange(min: number, max: number): [number, number] {
  return [min * TYPING_SPEED_FACTOR, max * TYPING_SPEED_FACTOR];
}

function normalizeTypingSpeedMultiplier(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 1;
  return Math.min(10, Math.max(0.25, value));
}

function scaleRangeForSpeed(range: [number, number], speedMultiplier: number): [number, number] {
  return [Math.max(0.5, range[0] / speedMultiplier), Math.max(0.5, range[1] / speedMultiplier)];
}

function biasedLow(min: number, max: number, rng: () => number): number {
  const sample = rng();
  return min + (max - min) * sample * sample;
}

function naturalKeyDelay(
  min: number,
  max: number,
  rng: () => number,
  speedMultiplier: number,
): number {
  const r = rng();
  if (r < 0.03) {
    return biasedLow(min, max, rng) + randomFromRange(80, 200, rng) / speedMultiplier;
  }
  if (r < 0.15) {
    return randomFromRange(min, max * 2, rng);
  }
  return biasedLow(min, max, rng);
}

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t';
}

function isLinebreak(ch: string): boolean {
  return ch === '\n' || ch === '\r';
}

function isPunctuation(ch: string): boolean {
  return /[.,!?;:]/.test(ch);
}

function isSentenceEnd(ch: string): boolean {
  return /[.!?]/.test(ch);
}

function isWordBurstChar(ch: string): boolean {
  return !isWhitespace(ch) && !isLinebreak(ch) && !isPunctuation(ch);
}

export function buildNaturalTypingPlan(
  text: string,
  options?: Pick<
    HumanTypeOptions,
    | 'delayRange'
    | 'thinkProbability'
    | 'thinkRange'
    | 'typingSpeedMultiplier'
    | 'wordPauseMaxMs'
    | 'rng'
  >,
): HumanTypingStep[] {
  const rng = options?.rng ?? Math.random;
  const speedMultiplier = normalizeTypingSpeedMultiplier(options?.typingSpeedMultiplier);
  const delayRange = scaleRangeForSpeed(
    options?.delayRange ?? defaultRange(30, 80),
    speedMultiplier,
  );
  const thinkProbability = options?.thinkProbability ?? 0.05;
  const thinkRange = scaleRangeForSpeed(
    options?.thinkRange ?? defaultRange(600, 1500),
    speedMultiplier,
  );
  const scaledDefaultRange = (min: number, max: number): [number, number] =>
    scaleRangeForSpeed(defaultRange(min, max), speedMultiplier);
  const wordPauseMaxMs = options?.wordPauseMaxMs ?? 40;
  const wordPauseRange: [number, number] = scaleRangeForSpeed(
    [wordPauseMaxMs * 0.3, wordPauseMaxMs],
    speedMultiplier,
  );
  const steps: HumanTypingStep[] = [];
  const chars = [...text];
  let wordsUntilThink = 2 + Math.floor(rng() * 3);

  for (let i = 0; i < chars.length; ) {
    const ch = chars[i] as string;

    if (isLinebreak(ch)) {
      const nextIsLfPair = ch === '\r' && chars[i + 1] === '\n';
      const linebreak = nextIsLfPair ? '\r\n' : ch;
      steps.push({
        text: linebreak,
        keyDelayMs: 0,
        keyDelayMsByChar: [...linebreak].map(() => 0),
        delayAfterMs: randomFromRange(...scaledDefaultRange(250, 650), rng),
        kind: 'linebreak',
      });
      i += nextIsLfPair ? 2 : 1;
      continue;
    }

    if (isWhitespace(ch)) {
      let value = ch;
      i++;
      while (i < chars.length && isWhitespace(chars[i] as string)) {
        value += chars[i] as string;
        i++;
      }
      steps.push({
        text: value,
        keyDelayMs: 0,
        keyDelayMsByChar: [...value].map(() => 0),
        delayAfterMs: randomFromRange(wordPauseRange[0], wordPauseRange[1], rng),
        kind: 'space',
      });
      continue;
    }

    if (isPunctuation(ch)) {
      let delayAfterMs = randomFromRange(...scaledDefaultRange(200, 500), rng);
      if (isSentenceEnd(ch) && rng() < 0.3) {
        delayAfterMs += randomFromRange(...scaledDefaultRange(400, 900), rng);
      }
      const keyDelayMs = naturalKeyDelay(
        Math.max(10, delayRange[0]),
        delayRange[1],
        rng,
        speedMultiplier,
      );
      steps.push({
        text: ch,
        keyDelayMs,
        keyDelayMsByChar: [keyDelayMs],
        delayAfterMs,
        kind: 'punctuation',
      });
      i++;
      continue;
    }

    let word = ch;
    i++;
    while (i < chars.length && isWordBurstChar(chars[i] as string)) {
      word += chars[i] as string;
      i++;
    }

    let delayAfterMs = rng() < 0.02 ? randomFromRange(...scaledDefaultRange(40, 80), rng) : 0;
    wordsUntilThink--;
    if (wordsUntilThink <= 0) {
      if (rng() < thinkProbability) {
        delayAfterMs += randomFromRange(thinkRange[0], thinkRange[1], rng);
      }
      wordsUntilThink = 2 + Math.floor(rng() * 3);
    }

    const keyDelayMsByChar = [...word].map(() =>
      naturalKeyDelay(delayRange[0], delayRange[1], rng, speedMultiplier),
    );

    steps.push({
      text: word,
      keyDelayMs: keyDelayMsByChar[0] ?? delayRange[0],
      keyDelayMsByChar,
      delayAfterMs,
      kind: 'word',
    });
  }

  return steps;
}

export async function humanType(
  locator: Locator,
  text: string,
  options?: HumanTypeOptions,
): Promise<void> {
  const clearFirst = options?.clearFirst ?? false;

  const page: Page = locator.page();

  await humanMouseClick(page, locator);

  if (clearFirst) {
    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.press('Delete');
  }

  for (const step of buildNaturalTypingPlan(text, options)) {
    // Type the full step text in one call to avoid slowMo being applied per-character.
    // Use the average of per-char delays so the overall pace is preserved.
    const avgDelay =
      step.keyDelayMsByChar.length > 0
        ? step.keyDelayMsByChar.reduce((a, b) => a + b, 0) / step.keyDelayMsByChar.length
        : step.keyDelayMs;
    await page.keyboard.type(step.text, { delay: avgDelay });
    if (step.delayAfterMs > 0) await sleep(step.delayAfterMs);
  }
}

// --- Block / rate-limit detection ---

export interface BlockSignal {
  blocked: boolean;
  reason?: string;
  cooldownMs: number;
}

const DEFAULT_BLOCK_PHRASES = [
  'Action Blocked',
  'Try Again Later',
  'We limit how often',
  "You're Temporarily Blocked",
  'rate limit',
  'unusual activity',
  'something went wrong',
  'please try again in',
] as const;

export async function checkBlocked(
  page: Page,
  options?: {
    extraPhrases?: string[];
    perCheckTimeoutMs?: number;
    cooldownMs?: number;
  },
): Promise<BlockSignal> {
  const perCheckTimeoutMs = options?.perCheckTimeoutMs ?? 500;
  const cooldownMs = options?.cooldownMs ?? 3 * 60 * 60 * 1000;
  const phrases = [...DEFAULT_BLOCK_PHRASES, ...(options?.extraPhrases ?? [])];

  for (const phrase of phrases) {
    try {
      const visible = await isLocatorVisible(
        page.getByText(phrase, { exact: false }).first(),
        perCheckTimeoutMs,
      );
      if (visible) {
        return { blocked: true, reason: phrase, cooldownMs };
      }
    } catch {
      // Playwright throws on timeout — treat as not found
    }
  }

  return { blocked: false, cooldownMs: 0 };
}
