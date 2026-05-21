import { describe, expect, it } from 'vitest';

import {
  buildNaturalTypingPlan,
  jitterSleep,
  randomFloat,
  randomInt,
  selectAllShortcut,
  sleep,
} from '../src/core/humanize.js';

describe('randomInt', () => {
  it('returns the only possible value when min === max', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it('always returns a value in [min, max] over 1000 trials', () => {
    const min = 1;
    const max = 10;
    const results = Array.from({ length: 1000 }, () => randomInt(min, max));
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(min);
      expect(r).toBeLessThanOrEqual(max);
    }
    // High-probability assertion: both bounds observed in 1000 trials
    expect(results.some((r) => r === min)).toBe(true);
    expect(results.some((r) => r === max)).toBe(true);
  });
});

describe('randomFloat', () => {
  it('returns values in [0, 1) over 1000 trials', () => {
    const results = Array.from({ length: 1000 }, () => randomFloat(0, 1));
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });
});

describe('sleep', () => {
  it('fixed sleep(50) resolves within a reasonable window', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(200);
  });

  it('sleep(50, 100) resolves within a reasonable window', async () => {
    const start = Date.now();
    await sleep(50, 100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(elapsed).toBeLessThan(250);
  });
});

describe('jitterSleep', () => {
  it('jitterSleep(100) resolves within the expected range', async () => {
    const start = Date.now();
    await jitterSleep(100);
    const elapsed = Date.now() - start;
    // deviation=1 means factor in [1, 2], so expected range 100..200ms
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(250);
  });
});

describe('selectAllShortcut', () => {
  it('uses Meta+A on macOS and Control+A elsewhere', () => {
    expect(selectAllShortcut('darwin')).toBe('Meta+A');
    expect(selectAllShortcut('win32')).toBe('Control+A');
    expect(selectAllShortcut('linux')).toBe('Control+A');
  });
});

describe('buildNaturalTypingPlan', () => {
  it('groups words into bursts and spaces into pauses', () => {
    const plan = buildNaturalTypingPlan('GrantCue helps teams', { rng: () => 0.5 });

    expect(plan.map((step) => [step.kind, step.text])).toEqual([
      ['word', 'GrantCue'],
      ['space', ' '],
      ['word', 'helps'],
      ['space', ' '],
      ['word', 'teams'],
    ]);
    expect(plan[0]?.keyDelayMs).toBeLessThan(plan[1]?.delayAfterMs ?? 0);
  });

  it('uses longer punctuation pauses than space pauses', () => {
    const plan = buildNaturalTypingPlan('Hello, world.', { rng: () => 0.5 });
    const comma = plan.find((step) => step.text === ',');
    const space = plan.find((step) => step.kind === 'space');

    expect(comma?.kind).toBe('punctuation');
    expect(comma?.delayAfterMs ?? 0).toBeGreaterThan(space?.delayAfterMs ?? 0);
  });

  it('respects explicit delay ranges for word bursts', () => {
    const plan = buildNaturalTypingPlan('abc', {
      delayRange: [10, 20],
      rng: () => 1,
    });

    expect(plan).toHaveLength(1);
    expect(plan[0]?.keyDelayMs).toBe(20);
    expect(plan[0]?.text).toBe('abc');
  });

  it('samples fresh key delays inside a word burst', () => {
    const samples = [0.5, 0.5, 0, 0.5, 1];
    const plan = buildNaturalTypingPlan('abc', {
      delayRange: [10, 20],
      rng: () => samples.shift() ?? 0.5,
    });

    expect(plan[0]?.keyDelayMsByChar).toEqual([10, 12.5, 20]);
  });

  it('does not introduce typo text into the plan', () => {
    const text = 'No typos, please.';
    const typed = buildNaturalTypingPlan(text, { rng: () => 0.01 })
      .map((step) => step.text)
      .join('');

    expect(typed).toBe(text);
  });

  it('uses faster default natural cadence timings', () => {
    const plan = buildNaturalTypingPlan('a b.', { rng: () => 1 });
    const word = plan.find((step) => step.kind === 'word');
    const space = plan.find((step) => step.kind === 'space');
    const punctuation = plan.find((step) => step.kind === 'punctuation');

    expect(word?.keyDelayMs).toBeCloseTo(45);
    expect(space?.delayAfterMs).toBeCloseTo(168.75);
    expect(punctuation?.delayAfterMs).toBeCloseTo(281.25);
  });

  it('scales default typing timings with a speed multiplier', () => {
    const plan = buildNaturalTypingPlan('a b.', { rng: () => 1, typingSpeedMultiplier: 2 });
    const word = plan.find((step) => step.kind === 'word');
    const space = plan.find((step) => step.kind === 'space');
    const punctuation = plan.find((step) => step.kind === 'punctuation');

    expect(word?.keyDelayMs).toBeCloseTo(22.5);
    expect(space?.delayAfterMs).toBeCloseTo(84.375);
    expect(punctuation?.delayAfterMs).toBeCloseTo(140.625);
  });
});
