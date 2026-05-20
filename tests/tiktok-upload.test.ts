import { describe, expect, it } from 'vitest';
import {
  getCalendarNavigationDirection,
  isSupportedCoverPath,
  isSupportedVideoPath,
  normalizeSchedule,
  validateSchedule,
} from '../src/platforms/tiktok/upload.js';

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Round a date's minutes down to nearest 5-minute boundary */
function snapToFiveMinutes(d: Date): Date {
  const snapped = new Date(d);
  snapped.setMinutes(Math.floor(snapped.getMinutes() / 5) * 5, 0, 0);
  return snapped;
}

describe('validateSchedule', () => {
  it('does not throw for a valid date 30 minutes from now with minutes on a 5-minute boundary', () => {
    const at = snapToFiveMinutes(minutesFromNow(30));
    expect(() => validateSchedule(at)).not.toThrow();
  });

  it('normalizes minutes upward to TikTok 5-minute increments', () => {
    const at = minutesFromNow(30);
    at.setMinutes(at.getMinutes() - (at.getMinutes() % 5) + 3); // force non-multiple
    // Ensure still in future
    if (at.getTime() - Date.now() < 20 * 60 * 1000) {
      at.setMinutes(at.getMinutes() + 25);
    }
    const normalized = normalizeSchedule(at);
    expect(normalized.getMinutes() % 5).toBe(0);
    expect(normalized.getTime()).toBeGreaterThan(at.getTime());
    expect(() => validateSchedule(at)).not.toThrow();
  });

  it('throws when fewer than 20 minutes in the future', () => {
    const at = new Date(Date.now() + 10 * 60 * 1000);
    at.setMinutes(Math.floor(at.getMinutes() / 5) * 5, 0, 0);
    expect(() => validateSchedule(at)).toThrow(/20 minutes/i);
  });

  it('throws when more than 10 days in the future', () => {
    const at = daysFromNow(11);
    at.setMinutes(Math.floor(at.getMinutes() / 5) * 5, 0, 0);
    expect(() => validateSchedule(at)).toThrow(/10 days/i);
  });

  it('throws for an invalid date', () => {
    expect(() => validateSchedule(new Date('not-a-date'))).toThrow(/valid date/i);
  });
});

describe('TikTok file type checks', () => {
  it('accepts video extensions from the source uploader', () => {
    expect(isSupportedVideoPath('clip.mp4')).toBe(true);
    expect(isSupportedVideoPath('clip.WEBM')).toBe(true);
    expect(isSupportedVideoPath('clip.txt')).toBe(false);
  });

  it('accepts supported custom cover image extensions', () => {
    expect(isSupportedCoverPath('cover.jpg')).toBe(true);
    expect(isSupportedCoverPath('cover.PNG')).toBe(true);
    expect(isSupportedCoverPath('cover.webp')).toBe(false);
  });
});

describe('getCalendarNavigationDirection', () => {
  it('goes forward from December to January', () => {
    expect(getCalendarNavigationDirection(12, 1)).toBe('next');
  });

  it('goes backward from January to December', () => {
    expect(getCalendarNavigationDirection(1, 12)).toBe('previous');
  });

  it('does not navigate when already on the target month', () => {
    expect(getCalendarNavigationDirection(6, 6)).toBeNull();
  });
});
