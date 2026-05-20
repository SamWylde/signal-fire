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
