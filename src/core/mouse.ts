import type { Locator, Page } from 'patchright';
import { sleep } from './timing.js';

export interface Point {
  x: number;
  y: number;
}

export interface MouseMoveOpts {
  targetWidth?: number;
  overshootProb?: number;
  overshootProbability?: number;
  rng?: () => number;
}

export interface ClickOpts extends MouseMoveOpts {
  holdMs?: number;
  button?: 'left' | 'right' | 'middle';
}

export interface ScrollOpts {
  deltaX?: number;
  deltaY?: number;
  steps?: number;
  easingMs?: number;
  rng?: () => number;
}

export interface BezierControls {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  t1: number;
  t2: number;
  o1: number;
  o2: number;
}

export interface KnuthJitter {
  basePattern: number[];
  indices: number[];
  jitter: number[];
}

export interface MousePath {
  waypoints: Point[];
  delays: number[];
  perpendicularDisplacements: number[];
  totalDuration: number;
  rawSampleCount: number;
  waypointCount: number;
  jitterBasePattern: number[];
  jitterIndices: number[];
  controls: BezierControls[];
}

const mousePositions = new WeakMap<Page, Point>();
const DEFAULT_POINT: Point = { x: 0, y: 0 };
const DEFAULT_OVERSHOOT_PROBABILITY = 0.175;
const LOG_NORMAL_SIGMA = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function uniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function direction(
  from: Point,
  to: Point,
): { d: number; ux: number; uy: number; px: number; py: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { d: 0, ux: 1, uy: 0, px: 0, py: 1 };
  const ux = dx / d;
  const uy = dy / d;
  return { d, ux, uy, px: -uy, py: ux };
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function normal(rng: () => number): number {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = Math.max(Number.EPSILON, rng());
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function boxMullerMs(
  mean: number,
  standardDeviation: number,
  rng: () => number = Math.random,
): number {
  return mean + normal(rng) * standardDeviation;
}

export function clickHoldMs(rng: () => number = Math.random): number {
  return clamp(boxMullerMs(90, 25, rng), 50, 200);
}

export function fittsDuration(distancePx: number, targetWidthPx: number): number {
  const width = Math.max(1, targetWidthPx);
  return 100 + 120 * Math.log2(distancePx / width + 1);
}

export function buildBezierControls(from: Point, to: Point, rng: () => number): BezierControls {
  const { d, ux, uy, px, py } = direction(from, to);
  const t1 = uniform(rng, 0.2, 0.4);
  const o1 = d * uniform(rng, -0.12, 0.12);
  const t2 = uniform(rng, 0.6, 0.8);
  const o2 = -o1 * uniform(rng, 0.5, 1);

  return {
    p0: { ...from },
    p1: {
      x: from.x + t1 * d * ux + o1 * px,
      y: from.y + t1 * d * uy + o1 * py,
    },
    p2: {
      x: from.x + t2 * d * ux + o2 * px,
      y: from.y + t2 * d * uy + o2 * py,
    },
    p3: { ...to },
    t1,
    t2,
    o1,
    o2,
  };
}

function cubicBezier({ p0, p1, p2, p3 }: BezierControls, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t2 * t * p3.x,
    y: mt2 * mt * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t2 * t * p3.y,
  };
}

export function rawSampleCount(distancePx: number): number {
  return clamp(Math.ceil(distancePx / 0.5), 8, 600);
}

export function waypointCount(rawCount: number): number {
  return Math.max(Math.round(rawCount / 10), 8);
}

function sampleBezier(controls: BezierControls, sampleCount: number): Point[] {
  return Array.from({ length: sampleCount }, (_, index) =>
    cubicBezier(controls, (index + 1) / sampleCount),
  );
}

function groupedWaypoints(samples: Point[], groups: number): Point[] {
  const waypoints: Point[] = [];
  for (let i = 0; i < groups; i++) {
    const start = Math.floor((i * samples.length) / groups);
    const end = Math.max(start + 1, Math.floor(((i + 1) * samples.length) / groups));
    const group = samples.slice(start, end);
    const fallback = samples[Math.min(samples.length - 1, start)] ?? { x: 0, y: 0 };
    const sum = group.reduce<Point>((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
      x: 0,
      y: 0,
    });
    waypoints.push(
      group.length === 0 ? fallback : { x: sum.x / group.length, y: sum.y / group.length },
    );
  }

  const last = samples.at(-1);
  if (last !== undefined) waypoints[waypoints.length - 1] = last;
  return waypoints;
}

export function buildJitterBasePattern(count: number, distancePx: number): number[] {
  const amplitude = distancePx * 0.004;
  return Array.from({ length: count }, (_, i) => {
    const k = Math.max(1, count);
    return Math.sin((i * Math.PI) / k) * (1 - i / k) * amplitude;
  });
}

export function buildKnuthJitter(
  count: number,
  distancePx: number,
  rng: () => number = Math.random,
): KnuthJitter {
  const basePattern = buildJitterBasePattern(count, distancePx);
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }

  return {
    basePattern,
    indices,
    jitter: indices.map((index) => (basePattern[index] as number) * (rng() < 0.5 ? -1 : 1)),
  };
}

function logNormalDelays(count: number, plannedDuration: number, rng: () => number): number[] {
  if (count <= 0) return [];
  const mu = Math.log(plannedDuration / count) - LOG_NORMAL_SIGMA ** 2 / 2;
  return Array.from({ length: count }, () => Math.exp(mu + LOG_NORMAL_SIGMA * normal(rng)));
}

function overshootPoint(from: Point, to: Point, rng: () => number): Point {
  const { d } = direction(from, to);
  const theta = Math.atan2(to.y - from.y, to.x - from.x);
  const angle = theta + uniform(rng, -0.15, 0.15);
  const magnitude = d * uniform(rng, 0.03, 0.08);
  return {
    x: to.x + magnitude * Math.cos(angle),
    y: to.y + magnitude * Math.sin(angle),
  };
}

function buildSingleMousePath(
  from: Point,
  to: Point,
  opts: MouseMoveOpts,
  rng: () => number,
): MousePath {
  const { d, px, py } = direction(from, to);
  const plannedDuration = fittsDuration(d, opts.targetWidth ?? 20);

  if (d === 0) {
    return {
      waypoints: [{ ...to }],
      delays: [plannedDuration],
      perpendicularDisplacements: [0],
      totalDuration: plannedDuration,
      rawSampleCount: 8,
      waypointCount: 8,
      jitterBasePattern: [0],
      jitterIndices: [0],
      controls: [],
    };
  }

  const controls = buildBezierControls(from, to, rng);
  const sampleCount = rawSampleCount(d);
  const groupedCount = waypointCount(sampleCount);
  const waypoints = groupedWaypoints(sampleBezier(controls, sampleCount), groupedCount);
  const jitter = buildKnuthJitter(waypoints.length, d, rng);

  for (let i = 0; i < waypoints.length; i++) {
    const point = waypoints[i] as Point;
    const perpendicular = jitter.jitter[i] as number;
    point.x += perpendicular * px;
    point.y += perpendicular * py;
  }

  return {
    waypoints,
    delays: logNormalDelays(waypoints.length, plannedDuration, rng),
    perpendicularDisplacements: jitter.jitter,
    totalDuration: plannedDuration,
    rawSampleCount: sampleCount,
    waypointCount: groupedCount,
    jitterBasePattern: jitter.basePattern,
    jitterIndices: jitter.indices,
    controls: [controls],
  };
}

function combinePaths(paths: MousePath[]): MousePath {
  return {
    waypoints: paths.flatMap((path) => path.waypoints),
    delays: paths.flatMap((path) => path.delays),
    perpendicularDisplacements: paths.flatMap((path) => path.perpendicularDisplacements),
    totalDuration: paths.reduce((sum, path) => sum + path.totalDuration, 0),
    rawSampleCount: paths.reduce((sum, path) => sum + path.rawSampleCount, 0),
    waypointCount: paths.reduce((sum, path) => sum + path.waypointCount, 0),
    jitterBasePattern: paths.flatMap((path) => path.jitterBasePattern),
    jitterIndices: paths.flatMap((path) => path.jitterIndices),
    controls: paths.flatMap((path) => path.controls),
  };
}

export function buildMousePath(from: Point, to: Point, opts: MouseMoveOpts = {}): MousePath {
  const rng = opts.rng ?? Math.random;
  const overshootProb =
    opts.overshootProb ?? opts.overshootProbability ?? DEFAULT_OVERSHOOT_PROBABILITY;

  if (distance(from, to) > 0 && overshootProb > 0 && rng() < overshootProb) {
    const over = overshootPoint(from, to, rng);
    return combinePaths([
      buildSingleMousePath(from, over, { ...opts, overshootProb: 0, overshootProbability: 0 }, rng),
      buildSingleMousePath(over, to, { ...opts, overshootProb: 0, overshootProbability: 0 }, rng),
    ]);
  }

  return buildSingleMousePath(from, to, opts, rng);
}

export function getMousePosition(page: Page): Point {
  return { ...(mousePositions.get(page) ?? DEFAULT_POINT) };
}

export async function humanMove(page: Page, to: Point, opts: MouseMoveOpts = {}): Promise<void> {
  const from = getMousePosition(page);
  const path = buildMousePath(from, to, opts);

  for (let i = 0; i < path.waypoints.length; i++) {
    const point = path.waypoints[i] as Point;
    await page.mouse.move(point.x, point.y);
    await sleep(path.delays[i] ?? 0);
  }

  const last = path.waypoints.at(-1);
  if (last === undefined || Math.hypot(last.x - to.x, last.y - to.y) > 0.01) {
    await page.mouse.move(to.x, to.y);
  }
  mousePositions.set(page, { ...to });
}

function targetLocator(page: Page, selectorOrLocator: string | Locator): Locator {
  return typeof selectorOrLocator === 'string'
    ? page.locator(selectorOrLocator).first()
    : selectorOrLocator;
}

async function targetBoundingBox(locator: Locator) {
  const maybeLocator = locator as Locator & {
    boundingBox?: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  };
  const box =
    typeof maybeLocator.boundingBox === 'function' ? await maybeLocator.boundingBox() : null;
  if (box === null) {
    throw new Error('Cannot click target without a visible bounding box');
  }
  return box;
}

export async function humanClick(
  page: Page,
  selectorOrLocator: string | Locator,
  opts: ClickOpts = {},
): Promise<void> {
  const locator = targetLocator(page, selectorOrLocator);
  let box: { x: number; y: number; width: number; height: number };
  try {
    box = await targetBoundingBox(locator);
  } catch (err) {
    const maybeClickable = locator as Locator & { click?: () => Promise<void> };
    if (typeof maybeClickable.click === 'function') {
      process.stderr.write(
        '[mouse] humanClick falling back to locator.click() — element has no visible bounding box\n',
      );
      await maybeClickable.click();
      return;
    }
    throw err;
  }

  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await humanMove(page, to, { ...opts, targetWidth: opts.targetWidth ?? box.width });
  await page.mouse.down({ button: opts.button ?? 'left' });
  await sleep(opts.holdMs ?? clickHoldMs(opts.rng));
  await page.mouse.up({ button: opts.button ?? 'left' });
}

export async function humanScroll(page: Page, delta: Point, opts?: ScrollOpts): Promise<void>;
export async function humanScroll(page: Page, delta: number, opts?: ScrollOpts): Promise<void>;
export async function humanScroll(
  page: Page,
  delta: number | Point,
  opts: ScrollOpts = {},
): Promise<void> {
  const rng = opts.rng ?? Math.random;
  const dx = opts.deltaX ?? (typeof delta === 'number' ? 0 : delta.x);
  const dy = opts.deltaY ?? (typeof delta === 'number' ? delta : delta.y);
  const magnitude = Math.hypot(dx, dy);
  const steps = opts.steps ?? Math.max(4, Math.min(18, Math.ceil(magnitude / 160)));
  const easingMs = opts.easingMs ?? steps * 24;
  let previousEase = 0;

  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const eased = easeInOutSine(progress);
    const share = eased - previousEase;
    previousEase = eased;
    const wobble = 0.92 + rng() * 0.16;
    await page.mouse.wheel(dx * share * wobble, dy * share * wobble);
    await sleep(easingMs / steps + rng() * 12);
  }
}
