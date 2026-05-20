import { describe, expect, it } from 'vitest';
import { filterMediaForX } from '../src/platforms/x/compose.js';
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
