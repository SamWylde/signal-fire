import { describe, expect, it } from 'vitest';
import { filterMediaForX, waitForStableXPostButtonEnabled } from '../src/platforms/x/compose.js';
import { X } from '../src/platforms/x/selectors.js';

describe('filterMediaForX', () => {
  it('returns [] for empty input', () => {
    expect(filterMediaForX([])).toEqual([]);
  });

  it('passes through up to 4 images unchanged', () => {
    expect(filterMediaForX(['a.jpg', 'b.png', 'c.webp'])).toEqual(['a.jpg', 'b.png', 'c.webp']);
  });

  it('caps images at 4 when more are provided', () => {
    const result = filterMediaForX(['a.jpg', 'b.png', 'c.png', 'd.jpg', 'e.jpg']);
    expect(result).toHaveLength(4);
    expect(result).toEqual(['a.jpg', 'b.png', 'c.png', 'd.jpg']);
  });

  it('keeps only the first video when multiple videos are provided', () => {
    expect(filterMediaForX(['a.mp4', 'b.mp4'])).toEqual(['a.mp4']);
  });

  it('treats .mov as a video extension', () => {
    expect(filterMediaForX(['a.mov'])).toEqual(['a.mov']);
  });

  it('treats .webm as a video extension', () => {
    expect(filterMediaForX(['a.webm', 'b.mp4'])).toEqual(['a.webm']);
  });

  it('treats .gif as an image extension', () => {
    expect(filterMediaForX(['a.gif', 'b.jpg'])).toEqual(['a.gif', 'b.jpg']);
  });

  it('prefers the first video when image + video input is mixed', () => {
    expect(filterMediaForX(['a.jpg', 'b.mp4'])).toEqual(['b.mp4']);
  });

  it('keeps one unknown file only when no known media types are present', () => {
    expect(filterMediaForX(['a.unknown_ext'])).toEqual(['a.unknown_ext']);
  });

  it('ignores unknown extensions when known images are present', () => {
    expect(filterMediaForX(['a.jpg', 'b.unknown_ext'])).toEqual(['a.jpg']);
  });

  it('is case-insensitive and prefers video for mixed-case mixed types', () => {
    expect(filterMediaForX(['A.JPG', 'B.MP4'])).toEqual(['B.MP4']);
  });
});

describe('X community selectors', () => {
  it('carries the audience picker selectors from the source composer flow', () => {
    expect(X.selectors.audience.chooseAudienceButton).toContain('Choose audience');
    expect(X.selectors.audience.container).toContain('HoverCard');
  });
});

// ---------------------------------------------------------------------------
// waitForStableXPostButtonEnabled tests
// ---------------------------------------------------------------------------

function makeLocator(opts: {
  waitForThrows?: boolean;
  visible: boolean[] | boolean;
  isDisabled: boolean[] | boolean;
  ariaDisabled: string[] | string;
}) {
  let step = 0;
  const seqOr = <T>(seq: T[] | T): T =>
    Array.isArray(seq) ? (seq[Math.min(step, seq.length - 1)] as T) : seq;
  const locator = {
    waitFor: async (_opts?: unknown) => {
      if (opts.waitForThrows) throw new Error('not visible');
    },
    isVisible: async () => seqOr(opts.visible),
    isDisabled: async () => seqOr(opts.isDisabled),
    getAttribute: async (_attr: string) => seqOr(opts.ariaDisabled),
  };
  const page = { locator: () => ({ first: () => locator }) };
  // Bump step on every isVisible call (called once per poll iteration).
  const origIsVisible = locator.isVisible;
  locator.isVisible = async () => {
    const val = await origIsVisible();
    step += 1;
    return val;
  };
  return { page, locator };
}

describe('waitForStableXPostButtonEnabled', () => {
  it('throws when the post button never becomes visible', async () => {
    const { page } = makeLocator({
      waitForThrows: true,
      visible: false,
      isDisabled: true,
      ariaDisabled: 'true',
    });
    await expect(
      waitForStableXPostButtonEnabled(page as unknown as Parameters<typeof waitForStableXPostButtonEnabled>[0], 'sel', 50),
    ).rejects.toThrow('not visible');
  });

  it('throws when the button is visible but never enables within the timeout', async () => {
    const { page } = makeLocator({
      visible: true,
      isDisabled: true,
      ariaDisabled: 'true',
    });
    await expect(
      waitForStableXPostButtonEnabled(page as unknown as Parameters<typeof waitForStableXPostButtonEnabled>[0], 'sel', 50),
    ).rejects.toThrow('did not stabilize');
  });

  it('resolves when the button is stably visible and enabled for two consecutive samples', async () => {
    const { page } = makeLocator({
      visible: true,
      isDisabled: false,
      ariaDisabled: 'false',
    });
    await expect(
      waitForStableXPostButtonEnabled(page as unknown as Parameters<typeof waitForStableXPostButtonEnabled>[0], 'sel', 1000),
    ).resolves.toBeUndefined();
  });

  it('resets the counter when state flickers', async () => {
    // visible sequence: [true, false, true, true, true, ...]
    // step 0 → true (consecutiveEnabled=1), step 1 → false (reset to 0),
    // step 2 → true (consecutiveEnabled=1), step 3 → true (consecutiveEnabled=2 → resolves)
    const { page } = makeLocator({
      visible: [true, false, true, true, true],
      isDisabled: false,
      ariaDisabled: 'false',
    });
    await expect(
      waitForStableXPostButtonEnabled(page as unknown as Parameters<typeof waitForStableXPostButtonEnabled>[0], 'sel', 2000),
    ).resolves.toBeUndefined();
  });
});
