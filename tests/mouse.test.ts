import { describe, expect, it } from 'vitest';

import {
  type Point,
  buildBezierControls,
  buildJitterBasePattern,
  buildKnuthJitter,
  buildMousePath,
  fittsDuration,
  rawSampleCount,
  waypointCount,
} from '../src/core/mouse.js';

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values: number[]): number {
  const avg = mean(values);
  return values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
}

function lagOneAutocorrelation(values: number[]): number {
  const avg = mean(values);
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < values.length - 1; i++) {
    numerator += ((values[i] as number) - avg) * ((values[i + 1] as number) - avg);
  }

  for (const value of values) {
    denominator += (value - avg) ** 2;
  }

  return numerator / denominator;
}

function sortedAbs(values: number[]): number[] {
  return values.map(Math.abs).sort((left, right) => left - right);
}

describe('Jiggly Knuth mouse path', () => {
  it('produces identical waypoints with a seeded RNG', () => {
    const from = { x: 12, y: 34 };
    const to = { x: 420, y: 215 };
    const a = buildMousePath(from, to, {
      rng: seededRng(8675309),
      targetWidth: 36,
      overshootProb: 0,
    });
    const b = buildMousePath(from, to, {
      rng: seededRng(8675309),
      targetWidth: 36,
      overshootProb: 0,
    });

    expect(a.waypoints).toEqual(b.waypoints);
    expect(a.delays).toEqual(b.delays);
    expect(a.perpendicularDisplacements).toEqual(b.perpendicularDisplacements);
  });

  it('uses the specified S-curve control point ranges and opposite-sign offsets', () => {
    const controls = buildBezierControls({ x: 0, y: 0 }, { x: 1000, y: 0 }, seededRng(101));

    expect(controls.t1).toBeGreaterThanOrEqual(0.2);
    expect(controls.t1).toBeLessThanOrEqual(0.4);
    expect(controls.t2).toBeGreaterThanOrEqual(0.6);
    expect(controls.t2).toBeLessThanOrEqual(0.8);
    expect(Math.abs(controls.o1)).toBeLessThanOrEqual(120);
    expect(Math.sign(controls.o2)).toBe(-Math.sign(controls.o1));
    expect(Math.abs(controls.o2 / controls.o1)).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(controls.o2 / controls.o1)).toBeLessThanOrEqual(1);
  });

  it('uses d/0.5 raw sampling and N/10 waypoint grouping', () => {
    expect(rawSampleCount(1000)).toBe(600);
    expect(waypointCount(600)).toBe(60);

    const path = buildMousePath(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { rng: seededRng(202), targetWidth: 20, overshootProb: 0 },
    );

    expect(path.rawSampleCount).toBe(600);
    expect(path.waypointCount).toBe(60);
    expect(path.waypoints).toHaveLength(60);
  });

  it('builds jitter by Knuth-shuffling the damped half-sine envelope', () => {
    const jitter = buildKnuthJitter(60, 1000, seededRng(303));
    const expectedEnvelope = buildJitterBasePattern(60, 1000);

    expect(jitter.basePattern).toEqual(expectedEnvelope);
    expect(new Set(jitter.indices).size).toBe(60);
    expect(Math.max(...jitter.basePattern)).toBeLessThanOrEqual(4);

    const sortedJitter = sortedAbs(jitter.jitter);
    const sortedEnvelope = sortedAbs(expectedEnvelope);
    for (let i = 0; i < sortedEnvelope.length; i++) {
      expect(sortedJitter[i]).toBeCloseTo(sortedEnvelope[i] as number, 12);
    }
  });

  it('keeps total duration pinned to Fitts law while delays are log-normal samples', () => {
    const rng = seededRng(42);

    for (let i = 0; i < 50; i++) {
      const from: Point = { x: rng() * 1200, y: rng() * 800 };
      const to: Point = { x: rng() * 1200, y: rng() * 800 };
      const width = 4 + rng() * 156;
      const path = buildMousePath(from, to, { rng, targetWidth: width, overshootProb: 0 });
      const expected = fittsDuration(Math.hypot(to.x - from.x, to.y - from.y), width);

      expect(path.totalDuration).toBeCloseTo(expected, 10);
      expect(path.delays.every((delay) => delay > 0)).toBe(true);
    }
  });

  it('keeps perpendicular displacements non-iid by limiting first-difference variance', () => {
    const path = buildMousePath(
      { x: 20, y: 80 },
      { x: 1120, y: 760 },
      { rng: seededRng(3), targetWidth: 18, overshootProb: 0 },
    );
    const diffs = path.perpendicularDisplacements
      .slice(1)
      .map((value, index) => value - (path.perpendicularDisplacements[index] as number));

    expect(lagOneAutocorrelation(path.perpendicularDisplacements)).toBeGreaterThan(0.1);
    expect(variance(diffs)).toBeLessThan(1.8 * variance(path.perpendicularDisplacements));
  });
});
