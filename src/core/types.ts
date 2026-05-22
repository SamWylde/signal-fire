import type { DebugCaptureResult } from './debug-artifacts.js';

export const POSTING_PLATFORMS = [
  'linkedin',
  'x',
  'facebook',
  'instagram',
  'tiktok',
  'youtube',
] as const;
export type PostingPlatform = (typeof POSTING_PLATFORMS)[number];

export type Platform =
  | 'tiktok'
  | 'x'
  | 'instagram'
  | 'youtube'
  | 'linkedin'
  | 'facebook'
  | 'pinterest'
  | 'reddit'
  | 'threads';

export type AccountId = string;

export interface PostInput {
  text?: string;
  mediaPaths?: string[];
  scheduleAt?: Date;
}

export interface PostResult {
  ok: boolean;
  url?: string;
  error?: string;
  debugArtifacts?: DebugCaptureResult;
}
