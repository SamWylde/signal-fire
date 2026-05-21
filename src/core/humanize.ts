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
  naturalCadence?: boolean;
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

function randomFromRange(min: number, max: number, rng: () => number): number {
  return min + (max - min) * rng();
}

function biasedLowFromRange(min: number, max: number, rng: () => number): number {
  const sample = rng();
  return min + (max - min) * sample * sample;
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
  options?: Pick<HumanTypeOptions, 'delayRange' | 'thinkProbability' | 'thinkRange' | 'rng'>,
): HumanTypingStep[] {
  const rng = options?.rng ?? Math.random;
  const delayRange = options?.delayRange ?? ([30, 80] as [number, number]);
  const thinkProbability = options?.thinkProbability ?? 0.05;
  const thinkRange = options?.thinkRange ?? ([600, 1500] as [number, number]);
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
        delayAfterMs: randomFromRange(250, 650, rng),
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
        delayAfterMs: randomFromRange(100, 300, rng),
        kind: 'space',
      });
      continue;
    }

    if (isPunctuation(ch)) {
      let delayAfterMs = randomFromRange(200, 500, rng);
      if (isSentenceEnd(ch) && rng() < 0.3) {
        delayAfterMs += randomFromRange(400, 900, rng);
      }
      const keyDelayMs = biasedLowFromRange(Math.max(10, delayRange[0]), delayRange[1], rng);
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

    let delayAfterMs = rng() < 0.02 ? randomFromRange(40, 80, rng) : 0;
    wordsUntilThink--;
    if (wordsUntilThink <= 0) {
      if (rng() < thinkProbability) {
        delayAfterMs += randomFromRange(thinkRange[0], thinkRange[1], rng);
      }
      wordsUntilThink = 2 + Math.floor(rng() * 3);
    }

    const keyDelayMsByChar = [...word].map(() =>
      biasedLowFromRange(delayRange[0], delayRange[1], rng),
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
  const delayRange = options?.delayRange ?? ([40, 110] as [number, number]);
  const thinkProbability = options?.thinkProbability ?? 0.08;
  const thinkRange = options?.thinkRange ?? ([250, 750] as [number, number]);
  const clearFirst = options?.clearFirst ?? false;

  const page: Page = locator.page();

  await humanMouseClick(page, locator);

  if (clearFirst) {
    await page.keyboard.press(selectAllShortcut());
    await page.keyboard.press('Delete');
  }

  // Natural cadence is the default path. Set naturalCadence=false only for tests or
  // platform fields that explicitly need the legacy uniform per-character behavior.
  if (options?.naturalCadence !== false) {
    for (const step of buildNaturalTypingPlan(text, options)) {
      const chars = [...step.text];
      for (const [index, ch] of chars.entries()) {
        await page.keyboard.type(ch, { delay: step.keyDelayMsByChar[index] ?? step.keyDelayMs });
      }
      if (step.delayAfterMs > 0) await sleep(step.delayAfterMs);
    }
    return;
  }

  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    await page.keyboard.type(ch, { delay: 0 });
    await sleep(delayRange[0], delayRange[1]);

    // Think pause: after non-space char when next char is space or end of string
    if (ch !== ' ') {
      const nextCh = chars[i + 1];
      if ((nextCh === ' ' || nextCh === undefined) && Math.random() < thinkProbability) {
        await sleep(thinkRange[0], thinkRange[1]);
      }
    }
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
