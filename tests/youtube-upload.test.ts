import { describe, expect, it } from 'vitest';
import { YOUTUBE } from '../src/platforms/youtube/selectors.js';
import { parseYouTubeUploadProgress, validateSchedule } from '../src/platforms/youtube/upload.js';

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

describe('validateSchedule (YouTube)', () => {
  it('does not throw for a valid date 30 minutes from now', () => {
    expect(() => validateSchedule(minutesFromNow(30))).not.toThrow();
  });

  it('throws when fewer than 15 minutes in the future', () => {
    expect(() => validateSchedule(minutesFromNow(10))).toThrow(/15 minutes/i);
  });

  it('throws when more than 6 months in the future', () => {
    expect(() => validateSchedule(daysFromNow(184))).toThrow(/6 months/i);
  });

  it('throws when in the past', () => {
    expect(() => validateSchedule(minutesFromNow(-60))).toThrow(/15 minutes/i);
  });

  it('throws for an invalid date', () => {
    expect(() => validateSchedule(new Date('not-a-date'))).toThrow(/valid date/i);
  });
});

describe('YouTube upload selectors', () => {
  it('keeps schedule radio separate from date picker', () => {
    expect(YOUTUBE.selectors.visibility.schedule).toBe("[name='SCHEDULE']");
    expect(YOUTUBE.selectors.visibility.scheduleDatePicker).toBe('#datepicker-trigger');
  });

  it('uses Studio upload controls instead of assuming a file input on the dashboard', () => {
    expect(YOUTUBE.selectors.upload.dialog).toBe('ytcp-uploads-dialog');
    expect(YOUTUBE.selectors.upload.fileInput).toContain('ytcp-uploads-dialog');
    expect(YOUTUBE.selectors.upload.createButton).toContain('Create');
    expect(YOUTUBE.selectors.upload.uploadVideosMenuItem).toContain('Upload videos');
  });

  it('carries thumbnail and playlist creation selectors from the source uploader', () => {
    expect(YOUTUBE.selectors.upload.thumbnailFileInput).toContain('file-loader');
    expect(YOUTUBE.selectors.playlist.itemsContainer).toBe('#items');
    expect(YOUTUBE.selectors.playlist.newButton).toBe('.new-playlist-button');
    expect(YOUTUBE.selectors.playlist.createContainer).toBe('#create-playlist-form');
  });
});

describe('parseYouTubeUploadProgress', () => {
  it('detects no advancement at 0%', () => {
    expect(parseYouTubeUploadProgress('Uploading 0%')).toEqual({
      complete: false,
      started: false,
      percent: 0,
    });
  });

  it('detects non-zero upload progress', () => {
    expect(parseYouTubeUploadProgress('Uploading 37%')).toEqual({
      complete: false,
      started: true,
      percent: 37,
    });
  });

  it('treats completed upload status as ready even without a percent', () => {
    expect(parseYouTubeUploadProgress('Upload complete. Checks complete.')).toEqual({
      complete: true,
      started: true,
    });
  });
});
