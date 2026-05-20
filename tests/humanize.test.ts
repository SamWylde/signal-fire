import { describe, expect, it } from 'vitest';

import {
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
