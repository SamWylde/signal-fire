import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import * as path from 'node:path';
import { Readable } from 'node:stream';

import {
  getSignalFireHome,
  migrateLegacyAccountIds,
  sanitizeAccountId,
} from '../core/account-id.js';
import { type ResizedVariant, resizeImageForPlatforms } from '../core/imageResize.js';
import {
  type BrowserContext,
  type LaunchOptions,
  type Page,
  launchBrowser,
} from '../core/browser.js';
import {
  clearStoredCredentials,
  readStoredCredentials,
  writeStoredCredentials,
} from '../core/credential-store.js';
import { captureFailureArtifacts } from '../core/debug-artifacts.js';
import { countRecent } from '../core/ledger.js';
import type { ActionLimits } from '../core/rate-limiter.js';
import {
  clearSession,
  ensureSignalFireDir,
  hasPersistentProfile,
  isSessionFresh,
  markUserDataDirValidated,
  readMetadata,
} from '../core/session.js';
import type { AccountId, PostResult } from '../core/types.js';
import { POSTING_PLATFORMS, type PostingPlatform } from '../core/types.js';
import { REDESIGNED_APP_HTML } from './app-html.js';

const LOGIN_URLS: Record<PostingPlatform, string> = {
  tiktok: 'https://www.tiktok.com/login',
  x: 'https://x.com/i/flow/login',
  facebook: 'https://www.facebook.com/login',
  linkedin: 'https://www.linkedin.com/login',
  youtube: 'https://accounts.google.com/signin',
  instagram: 'https://www.instagram.com/accounts/login',
};

interface LoginFlow {
  platform: PostingPlatform;
  accountId: AccountId;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
  startedAt: number;
}

interface StatusRow {
  platform: PostingPlatform;
  account: string;
  session: 'fresh' | 'stale' | 'none';
  lastValidated: string | null;
  postsPerHour: number;
  postsPerDay: number;
}

interface CampaignResult {
  platform: PostingPlatform;
  ok: boolean;
  status?: 'posted' | 'queued' | 'failed' | 'skipped' | 'prepared';
  url?: string;
  error?: string;
  detail?: string;
}

interface UiState {
  account?: string;
  activePlatform?: PostingPlatform;
  targets?: PostingPlatform[];
  fields?: Record<string, string | boolean>;
  draftFiles?: Record<string, DraftFileRef>;
  updatedAt?: string;
}

interface DraftFileRef {
  path: string;
  name: string;
  type?: string;
  size?: number;
  updatedAt: string;
  platformVariants?: Record<string, Omit<ResizedVariant, 'platform'>>;
}

export interface CampaignAssets {
  imagePath?: string;
  videoPath?: string;
  coverPath?: string;
  thumbnailPath?: string;
  platformImages?: Partial<Record<PostingPlatform, string>>;
  platformVideos?: Partial<Record<PostingPlatform, string>>;
}

interface StoredCampaign {
  account: string;
  targets: PostingPlatform[];
  fields: Record<string, string | boolean>;
  assets: CampaignAssets;
  textPreview: string;
}

type QueueStatus = 'queued' | 'posting' | 'posted' | 'failed' | 'canceled';

interface QueueEntry extends StoredCampaign {
  id: string;
  createdAt: string;
  scheduledAt: string;
  status: QueueStatus;
  lastRunAt?: string;
  completedAt?: string;
  results?: CampaignResult[];
  error?: string;
}

interface QueueEntryForClient {
  id: string;
  createdAt: string;
  scheduledAt: string;
  account: string;
  targets: PostingPlatform[];
  status: QueueStatus;
  textPreview: string;
  lastRunAt?: string;
  completedAt?: string;
  results?: CampaignResult[];
  error?: string;
}

interface HistoryEntry {
  id: string;
  createdAt: string;
  account: string;
  platform: PostingPlatform;
  ok: boolean;
  status: 'posted' | 'queued' | 'failed' | 'skipped' | 'prepared';
  textPreview: string;
  queueId?: string;
  scheduledAt?: string;
  url?: string;
  error?: string;
  detail?: string;
}

interface RunLogEntry {
  id: string;
  at: string;
  account?: string;
  platform?: PostingPlatform;
  scope: 'manual' | 'campaign' | 'queue' | 'login' | 'system';
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  detail?: string;
}

export interface UiServerOptions {
  host?: string;
  port?: number;
}

export interface UiServerHandle {
  server: Server;
  url: string;
  close: () => Promise<void>;
}

const loginFlows = new Map<string, LoginFlow>();
const activePosting = new Map<string, number>();
let runLogWriteQueue: Promise<void> = Promise.resolve();

export const MANUAL_VERIFY_PLATFORMS = ['linkedin', 'x', 'facebook', 'instagram'] as const;
export type ManualVerifyPlatform = (typeof MANUAL_VERIFY_PLATFORMS)[number];

interface ManualVerifySession {
  accountId: string;
  context: BrowserContext;
  close: () => Promise<void>;
  startedAt: number;
}

export interface ManualVerifyDriver {
  launch: (options: LaunchOptions) => Promise<{
    context: BrowserContext;
    close: () => Promise<void>;
  }>;
  isLoggedIn: (platform: ManualVerifyPlatform, page: Page) => Promise<boolean>;
  compose: (platform: ManualVerifyPlatform, page: Page, input: unknown) => Promise<void>;
  markValidated: (platform: ManualVerifyPlatform, accountId: AccountId) => Promise<void>;
}

const manualVerifySessions = new Map<string, ManualVerifySession>();
let manualVerifyDriverOverride: ManualVerifyDriver | null = null;

function acquirePostingLock(accountId: string): void {
  activePosting.set(accountId, (activePosting.get(accountId) ?? 0) + 1);
}

function releasePostingLock(accountId: string): void {
  const count = activePosting.get(accountId) ?? 0;
  if (count <= 1) activePosting.delete(accountId);
  else activePosting.set(accountId, count - 1);
}

function isPostingActive(accountId: string): boolean {
  return (activePosting.get(accountId) ?? 0) > 0;
}

class ManualVerifyActiveError extends Error {
  constructor(accountId: string) {
    super(
      `Manual verification browser is open for ${accountId}. Close it before running automatic posting.`,
    );
    this.name = 'ManualVerifyActiveError';
  }
}

export function isManualVerifyPlatform(value: PostingPlatform): value is ManualVerifyPlatform {
  return MANUAL_VERIFY_PLATFORMS.includes(value as ManualVerifyPlatform);
}

export function unsupportedManualVerifyTargets(targets: PostingPlatform[]): PostingPlatform[] {
  return targets.filter((target) => !isManualVerifyPlatform(target));
}

export function setManualVerifyDriverForTests(driver: ManualVerifyDriver | null): void {
  manualVerifyDriverOverride = driver;
}

function getManualVerifyKey(accountId: string): string {
  return accountKey(accountId);
}

function isManualVerifyActive(accountId: string): boolean {
  return legacyVariants(accountId).some((variant) =>
    manualVerifySessions.has(getManualVerifyKey(variant)),
  );
}

function isPostingActiveForAccount(accountId: string): boolean {
  return legacyVariants(accountId).some(isPostingActive);
}

function isLoginFlowActiveForAccount(accountId: string): boolean {
  for (const flow of loginFlows.values()) {
    if (sameAccount(flow.accountId, accountId)) return true;
  }
  return false;
}

function assertNoManualVerifyForAutomaticPost(accountId: string): void {
  if (isManualVerifyActive(accountId)) throw new ManualVerifyActiveError(accountId);
}

function assertCanStartManualVerify(accountId: string): void {
  if (isPostingActiveForAccount(accountId)) {
    throw new Error('A posting flow is active for this account. Wait for it to complete first.');
  }
  if (isManualVerifyActive(accountId)) {
    throw new Error('A manual verification browser is already open for this account.');
  }
  if (isLoginFlowActiveForAccount(accountId)) {
    throw new Error('A login browser is already open for this account. Close it first.');
  }
}

function trackManualVerifySession(
  accountId: string,
  context: BrowserContext,
  close: () => Promise<void>,
): void {
  const key = getManualVerifyKey(accountId);
  const session: ManualVerifySession = {
    accountId,
    context,
    close,
    startedAt: Date.now(),
  };
  manualVerifySessions.set(key, session);

  context.on('close', () => {
    if (manualVerifySessions.get(key) === session) {
      manualVerifySessions.delete(key);
      void appendRunLog({
        account: accountId,
        scope: 'manual',
        level: 'info',
        message: 'Manual verification browser closed',
      });
    }
  });
}

async function closeManualVerifySessions(): Promise<void> {
  const sessions = [...manualVerifySessions.entries()];
  manualVerifySessions.clear();
  await Promise.allSettled(sessions.map(([, session]) => session.close()));
}

function findLoginFlowId(platform: PostingPlatform, accountId: string): string | null {
  for (const [flowId, flow] of loginFlows) {
    if (flow.platform === platform && flow.accountId === accountId) return flowId;
  }
  return null;
}
let processingDueQueue = false;
const DEFAULT_CAMPAIGN_DELAY_MIN_SECONDS = 120;
const DEFAULT_CAMPAIGN_DELAY_MAX_SECONDS = 300;
const DEFAULT_TYPING_SPEED_PERCENT = 200;
const MAX_CAMPAIGN_DELAY_SECONDS = 3600;
const MIN_TYPING_SPEED_PERCENT = 50;
const MAX_TYPING_SPEED_PERCENT = 1000;
const DEFAULT_WORD_PAUSE_MAX_MS = 40;
const MIN_WORD_PAUSE_MAX_MS = 0;
const MAX_WORD_PAUSE_MAX_MS = 200;
const DEFAULT_POST_LIMIT_PER_HOUR = 4;
const DEFAULT_POST_LIMIT_PER_DAY = 20;
const MAX_POST_LIMIT = 1000;
const MAX_SLOW_MO_MS = 5000;
const UI_PORT_SEARCH_ATTEMPTS = 128;
const HISTORY_LIMIT = 250;
const RUN_LOG_LIMIT = 500;
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const RUN_LOG_DETAIL_LIMIT = 2048;
const QUEUE_POLL_INTERVAL_MS = 30_000;
const SAFETY_STOP_PATTERNS = [
  'action blocked',
  'captcha',
  'challenge',
  'checkpoint',
  'rate limit',
  'rate-limit',
  'suspicious',
  'temporarily blocked',
  'try again later',
  'unusual activity',
  'verify your account',
  'we limit how often',
] as const;

function isPostingPlatform(value: unknown): value is PostingPlatform {
  return typeof value === 'string' && POSTING_PLATFORMS.includes(value as PostingPlatform);
}

function getRoot(): string {
  return getSignalFireHome();
}

function getUiStatePath(): string {
  return path.join(getRoot(), 'ui', 'state.json');
}

function getHistoryPath(): string {
  return path.join(getRoot(), 'ui', 'history.json');
}

function getRunLogPath(): string {
  return path.join(getRoot(), 'ui', 'run-log.json');
}

function getUploadRoot(): string {
  return path.join(getRoot(), 'uploads');
}

function getQueuePath(): string {
  return path.join(getRoot(), 'ui', 'queue.json');
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name || 'upload.bin');
  return base.replace(/[^A-Za-z0-9_. -]/g, '_');
}

function canonicalExtensionForMime(mime: string): string | undefined {
  switch (mime.trim().toLowerCase().split(';')[0]) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    default:
      return undefined;
  }
}

function savedUploadFileName(file: File): string {
  const safeName = sanitizeFileName(file.name);
  if (path.extname(safeName).length > 0) return safeName;
  return `${safeName}${canonicalExtensionForMime(file.type) ?? ''}`;
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  return (raw.length > 0 ? JSON.parse(raw) : {}) as T;
}

async function readForm(req: IncomingMessage): Promise<FormData> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const request = new Request('http://signal-fire.local/form', {
    method: 'POST',
    headers,
    body: Readable.toWeb(req) as ReadableStream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  return request.formData();
}

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['on', 'true', '1', 'yes'].includes(normalized)) return true;
  if (['off', 'false', '0', 'no', ''].includes(normalized)) return false;
  return undefined;
}

function optionalFormBool(form: FormData, key: string): boolean | undefined {
  const values = form.getAll(key).filter((value): value is string => typeof value === 'string');
  return coerceBoolean(values.at(-1));
}

function formBool(form: FormData, key: string): boolean {
  return optionalFormBool(form, key) ?? false;
}

function parseSchedule(raw: string | undefined): { at: Date } | undefined {
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Schedule must be a valid date or timestamp');
  }
  return { at: date };
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return typeof value === 'object' && 'arrayBuffer' in value && 'name' in value && 'size' in value;
}

export async function saveUploadedFile(file: File, bucket: string): Promise<string | undefined> {
  if (file.size === 0 || file.name.length === 0) return undefined;
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Uploaded file exceeds 200 MB limit');
  await ensureSignalFireDir();
  const uploadDir = path.join(getUploadRoot(), bucket);
  await fs.mkdir(uploadDir, { recursive: true });

  const filePath = path.join(
    uploadDir,
    `${Date.now()}-${randomUUID().slice(0, 8)}-${savedUploadFileName(file)}`,
  );
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return filePath;
}

async function pruneOldDraftFiles(kind: string, keepFilePath: string): Promise<void> {
  const dir = path.dirname(keepFilePath);
  const keepName = path.basename(keepFilePath);
  const entries = await fs.readdir(dir).catch(() => []);
  await Promise.allSettled(
    entries
      .filter((name) => name !== keepName)
      .map((name) =>
        fs.unlink(path.join(dir, name)).catch((err: unknown) => {
          process.stderr.write(`[signal-fire] could not prune old draft ${name}: ${err}\n`);
        }),
      ),
  );
}

function savedPathFieldName(key: string): string {
  return `saved${key.charAt(0).toUpperCase()}${key.slice(1)}Path`;
}

function isPathInside(parent: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative.length === 0 || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function savedFilePath(form: FormData, key: string): Promise<string | undefined> {
  const rawPath = formString(form, savedPathFieldName(key));
  if (rawPath === undefined) return undefined;

  const resolvedPath = path.resolve(rawPath);
  if (!isPathInside(getUploadRoot(), resolvedPath)) {
    throw new Error(`${key} saved file path is outside the signal-fire uploads folder`);
  }

  const stat = await fs.stat(resolvedPath).catch(() => undefined);
  if (stat === undefined || !stat.isFile()) {
    throw new Error(`${key} saved file is missing; choose the file again`);
  }

  return resolvedPath;
}

async function optionalFileOrSaved(
  form: FormData,
  key: string,
  bucket: string,
): Promise<string | undefined> {
  return (await optionalFile(form, key, bucket)) ?? (await savedFilePath(form, key));
}

async function requireFile(form: FormData, key: string, bucket: string): Promise<string> {
  const saved = await optionalFileOrSaved(form, key, bucket);
  if (saved === undefined) throw new Error(`${key} file is required`);
  return saved;
}

async function optionalFile(
  form: FormData,
  key: string,
  bucket: string,
): Promise<string | undefined> {
  const value = form.get(key);
  if (value === null || !isUploadedFile(value)) return undefined;
  return saveUploadedFile(value, bucket);
}

async function optionalFiles(form: FormData, key: string, bucket: string): Promise<string[]> {
  const saved: string[] = [];
  for (const value of form.getAll(key)) {
    if (!isUploadedFile(value)) continue;
    const filePath = await saveUploadedFile(value, bucket);
    if (filePath !== undefined) saved.push(filePath);
  }
  return saved;
}

async function saveDraftFile(form: FormData): Promise<{ file: DraftFileRef; imageResizeError?: { message: string } }> {
  const kind = formString(form, 'kind');
  if (kind === undefined || !['image', 'video', 'cover', 'thumbnail'].includes(kind)) {
    throw new Error('Draft file kind is required');
  }

  const value = form.get('file');
  if (value === null || !isUploadedFile(value)) throw new Error('Draft file is required');
  const filePath = await saveUploadedFile(value, `draft-${kind}`);
  if (filePath === undefined) throw new Error('Draft file is required');
  await pruneOldDraftFiles(kind, filePath);

  const ref: DraftFileRef = {
    path: filePath,
    name: sanitizeFileName(value.name),
    ...(value.type.length > 0 && { type: value.type }),
    size: value.size,
    updatedAt: new Date().toISOString(),
  };

  let imageResizeError: { message: string } | undefined;
  if (kind === 'image') {
    try {
      const outputDir = path.dirname(filePath);
      const baseName = path.basename(filePath, path.extname(filePath));
      const variants = await resizeImageForPlatforms(filePath, outputDir, baseName);
      const platformVariants: Record<string, Omit<ResizedVariant, 'platform'>> = {};
      for (const v of variants) {
        platformVariants[v.platform] = { path: v.path, name: v.name, width: v.width, height: v.height, bytes: v.bytes };
      }
      ref.platformVariants = platformVariants;
    } catch (err) {
      process.stderr.write(`[signal-fire] image resize failed: ${err}\n`);
      imageResizeError = { message: err instanceof Error ? err.message : String(err) };
    }
  }

  return { file: ref, ...(imageResizeError !== undefined && { imageResizeError }) };
}

function defaultUiState(): UiState {
  return {
    account: 'main',
    activePlatform: 'tiktok',
    targets: ['x', 'linkedin'],
    fields: {
      text: '',
      title: '',
      campaignDelayMinSeconds: String(DEFAULT_CAMPAIGN_DELAY_MIN_SECONDS),
      campaignDelayMaxSeconds: String(DEFAULT_CAMPAIGN_DELAY_MAX_SECONDS),
      postLimitPerHour: String(DEFAULT_POST_LIMIT_PER_HOUR),
      postLimitPerDay: String(DEFAULT_POST_LIMIT_PER_DAY),
      slowMoMs: '50',
      typingSpeedPercent: String(DEFAULT_TYPING_SPEED_PERCENT),
      pageUrl: '',
      linkedinTarget: 'profile',
      linkedinPostType: 'post',
      linkedinCompanyPageUrl: '',
      linkedinCompanyId: '',
      linkedinTitle: '',
      linkedinShareIntro: '',
      tiktokVisibility: 'everyone',
      youtubeVisibility: 'private',
      allowComments: true,
      allowDuet: true,
      allowStitch: true,
      useBrowserProfile: true,
      spoofFingerprint: false,
    },
    draftFiles: {},
  };
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function mergeUiState(saved: UiState): UiState {
  const defaults = defaultUiState();
  const merged: UiState = {
    ...defaults,
    ...saved,
    fields: {
      ...(defaults.fields ?? {}),
      ...(saved.fields ?? {}),
    },
    draftFiles: {
      ...(defaults.draftFiles ?? {}),
      ...(saved.draftFiles ?? {}),
    },
  };

  if (!hasOwn(saved, 'account')) {
    const { account: _account, ...withoutAccount } = merged;
    return withoutAccount;
  }

  return merged;
}

async function loadUiState(): Promise<UiState> {
  try {
    const raw = await fs.readFile(getUiStatePath(), 'utf8');
    return mergeUiState(JSON.parse(raw) as UiState);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return defaultUiState();
    }
    throw err;
  }
}

async function readSavedSpoofFingerprint(): Promise<boolean> {
  const state = await loadUiState();
  return coerceBoolean(state.fields?.spoofFingerprint) ?? false;
}

export async function resolveSpoofFingerprintForLaunch(value: unknown): Promise<boolean> {
  return coerceBoolean(value) ?? (await readSavedSpoofFingerprint());
}

async function saveUiState(state: UiState): Promise<void> {
  const filePath = getUiStatePath();
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    tmpPath,
    JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  await fs.rename(tmpPath, filePath);
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function loadHistory(): Promise<HistoryEntry[]> {
  return readJsonFile<HistoryEntry[]>(getHistoryPath(), []);
}

async function saveHistory(entries: HistoryEntry[]): Promise<void> {
  await writeJsonFile(getHistoryPath(), entries.slice(0, HISTORY_LIMIT));
}

async function appendHistory(entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await saveHistory([...entries, ...(await loadHistory())]);
}

async function loadRunLog(): Promise<RunLogEntry[]> {
  return readJsonFile<RunLogEntry[]>(getRunLogPath(), []);
}

async function saveRunLog(entries: RunLogEntry[]): Promise<void> {
  await writeJsonFile(getRunLogPath(), entries.slice(0, RUN_LOG_LIMIT));
}

function truncateRunLogText(value: string | undefined): string | undefined {
  if (value === undefined || value.length <= RUN_LOG_DETAIL_LIMIT) return value;
  return `${value.slice(0, RUN_LOG_DETAIL_LIMIT)}... [truncated ${value.length - RUN_LOG_DETAIL_LIMIT} chars]`;
}

function prepareRunLogEntry(entry: Omit<RunLogEntry, 'id' | 'at'>): RunLogEntry {
  const fullEntry: RunLogEntry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    scope: entry.scope,
    level: entry.level,
    message: truncateRunLogText(entry.message) ?? '',
  };
  if (entry.account !== undefined) fullEntry.account = entry.account;
  if (entry.platform !== undefined) fullEntry.platform = entry.platform;
  const detail = truncateRunLogText(entry.detail);
  if (detail !== undefined) fullEntry.detail = detail;
  return fullEntry;
}

async function enqueueRunLogWrite(operation: () => Promise<void>): Promise<void> {
  const next = runLogWriteQueue.catch(() => undefined).then(operation);
  runLogWriteQueue = next.catch(() => undefined);
  await next;
}

async function appendRunLog(entry: Omit<RunLogEntry, 'id' | 'at'>): Promise<RunLogEntry> {
  const fullEntry = prepareRunLogEntry(entry);
  const prefix = ['signal-fire', fullEntry.scope, fullEntry.platform, fullEntry.account]
    .filter((item): item is string => item !== undefined && item.length > 0)
    .join(':');
  process.stderr.write(
    `[${prefix}] ${fullEntry.level}: ${fullEntry.message}${fullEntry.detail ? ` - ${fullEntry.detail}` : ''}\n`,
  );
  try {
    await enqueueRunLogWrite(async () => {
      await saveRunLog([fullEntry, ...(await loadRunLog())]);
    });
  } catch (err) {
    process.stderr.write(
      `[signal-fire:system] warn: could not persist run log - ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
  return fullEntry;
}

async function clearRunLog(): Promise<void> {
  await enqueueRunLogWrite(async () => {
    await saveRunLog([]);
  });
}

function runLogsForClient(entries: RunLogEntry[], account?: string): RunLogEntry[] {
  if (account === undefined) return entries;
  return entries.filter(
    (entry) => entry.account === undefined || sameAccount(entry.account, account),
  );
}

async function loadQueue(): Promise<QueueEntry[]> {
  return readJsonFile<QueueEntry[]>(getQueuePath(), []);
}

async function saveQueue(entries: QueueEntry[]): Promise<void> {
  await writeJsonFile(getQueuePath(), entries);
}

function accountKey(accountId: string | undefined): string {
  const trimmed = accountId?.trim() ?? '';
  return trimmed.length > 0 ? sanitizeAccountId(trimmed) : '';
}

function sameAccount(left: string | undefined, right: string | undefined): boolean {
  const leftKey = accountKey(left);
  const rightKey = accountKey(right);
  return leftKey.length > 0 && leftKey === rightKey;
}

function queueEntryForClient(entry: QueueEntry): QueueEntryForClient {
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    scheduledAt: entry.scheduledAt,
    account: entry.account,
    targets: entry.targets,
    status: entry.status,
    textPreview: entry.textPreview,
    ...(entry.lastRunAt !== undefined && { lastRunAt: entry.lastRunAt }),
    ...(entry.completedAt !== undefined && { completedAt: entry.completedAt }),
    ...(entry.results !== undefined && { results: entry.results }),
    ...(entry.error !== undefined && { error: entry.error }),
  };
}

function textPreview(value: string | undefined): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) return 'No post text yet';
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function campaignAccount(form: FormData): string {
  const accountId = formString(form, 'account');
  if (accountId === undefined) throw new Error('Account is required');
  return accountId;
}

function campaignTargets(form: FormData): PostingPlatform[] {
  const targets = form.getAll('targets').filter(isPostingPlatform);
  if (targets.length === 0) throw new Error('Choose at least one platform');
  return targets;
}

function persistableFormFields(form: FormData): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {};
  for (const [key, value] of form.entries()) {
    if (key === 'targets' || isUploadedFile(value)) continue;
    fields[key] = value;
  }
  return fields;
}

function buildStoredCampaignForm(campaign: StoredCampaign): FormData {
  const form = new FormData();
  form.set('account', campaign.account);
  for (const target of campaign.targets) form.append('targets', target);
  for (const [key, value] of Object.entries(campaign.fields)) {
    if (key === 'account' || key === 'targets' || key === 'schedule') continue;
    if (typeof value === 'boolean') {
      if (value) form.set(key, 'on');
    } else {
      form.set(key, value);
    }
  }
  return form;
}

async function enqueueCampaign(
  form: FormData,
  assets: CampaignAssets,
  schedule: { at: Date },
): Promise<QueueEntry> {
  const scheduledAtMs = schedule.at.getTime();
  if (scheduledAtMs <= Date.now()) {
    throw new Error('Schedule time must be in the future');
  }

  const entry: QueueEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    scheduledAt: schedule.at.toISOString(),
    status: 'queued',
    account: campaignAccount(form),
    targets: campaignTargets(form),
    fields: persistableFormFields(form),
    assets,
    textPreview: textPreview(textForCampaign(form)),
  };

  await saveQueue([entry, ...(await loadQueue())]);
  return entry;
}

async function updateQueueEntry(
  id: string,
  update: (entry: QueueEntry) => QueueEntry,
): Promise<QueueEntry> {
  const queue = await loadQueue();
  const index = queue.findIndex((entry) => entry.id === id);
  if (index === -1) throw new Error('Queue item was not found');
  const existing = queue[index];
  if (existing === undefined) throw new Error('Queue item was not found');
  const updated = update(existing);
  queue[index] = updated;
  await saveQueue(queue);
  return updated;
}

function queueResults(entry: QueueEntry): CampaignResult[] {
  return entry.targets.map((platform) => ({
    platform,
    ok: true,
    status: 'queued',
    detail: `Queued for ${new Date(entry.scheduledAt).toLocaleString()}`,
  }));
}

function historyFromResults(
  results: CampaignResult[],
  account: string,
  preview: string,
  meta: { queueId?: string; scheduledAt?: string } = {},
): HistoryEntry[] {
  return results.map((result) => ({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    account,
    platform: result.platform,
    ok: result.ok,
    status: result.status ?? (result.ok ? 'posted' : 'failed'),
    textPreview: preview,
    ...(meta.queueId !== undefined && { queueId: meta.queueId }),
    ...(meta.scheduledAt !== undefined && { scheduledAt: meta.scheduledAt }),
    ...(result.url !== undefined && { url: result.url }),
    ...(result.error !== undefined && { error: result.error }),
    ...(result.detail !== undefined && { detail: result.detail }),
  }));
}

async function getAccountsForPlatform(platform: PostingPlatform): Promise<string[]> {
  const accounts = new Set<string>();
  const sessionsDir = path.join(getRoot(), 'sessions', platform);
  const credentialsDir = path.join(getRoot(), 'credentials', platform);

  try {
    const entries = await fs.readdir(sessionsDir);
    for (const entry of entries) {
      if (entry.endsWith('.meta.json')) {
        try {
          const raw = await fs.readFile(path.join(sessionsDir, entry), 'utf8');
          const meta = JSON.parse(raw) as { accountId?: unknown };
          if (typeof meta.accountId === 'string' && meta.accountId.trim().length > 0) {
            accounts.add(meta.accountId.trim());
          }
        } catch {
          const stem = entry.slice(0, -'.meta.json'.length);
          try {
            accounts.add(decodeURIComponent(stem));
          } catch {
            accounts.add(stem);
          }
        }
      } else if (entry.endsWith('.json')) {
        const stem = entry.slice(0, -'.json'.length);
        try {
          accounts.add(decodeURIComponent(stem));
        } catch {
          accounts.add(stem);
        }
      }
    }
  } catch {}

  try {
    const entries = await fs.readdir(credentialsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(credentialsDir, entry), 'utf8');
        const record = JSON.parse(raw) as { accountId?: unknown };
        if (typeof record.accountId === 'string' && record.accountId.trim().length > 0) {
          accounts.add(record.accountId.trim());
          continue;
        }
      } catch {}
      const stem = entry.slice(0, -'.json'.length);
      try {
        accounts.add(decodeURIComponent(stem));
      } catch {
        accounts.add(stem);
      }
    }
  } catch {}

  return [...accounts].sort((left, right) => left.localeCompare(right));
}

async function listKnownAccounts(): Promise<string[]> {
  const accounts = new Set<string>();

  for (const platform of POSTING_PLATFORMS) {
    for (const account of await getAccountsForPlatform(platform)) {
      if (account.trim().length > 0) accounts.add(account.trim());
    }
  }

  for (const entry of await loadHistory()) {
    if (entry.account.trim().length > 0) accounts.add(entry.account.trim());
  }
  for (const entry of await loadQueue()) {
    if (entry.account.trim().length > 0) accounts.add(entry.account.trim());
  }

  return [...accounts].sort((left, right) => {
    if (left === 'main') return -1;
    if (right === 'main') return 1;
    return left.localeCompare(right);
  });
}

async function buildStatusRow(platform: PostingPlatform, accountId: string): Promise<StatusRow> {
  const meta = await readMetadata(platform, accountId);
  if (meta === null) {
    return {
      platform,
      account: accountId,
      session: (await hasPersistentProfile(platform, accountId)) ? 'stale' : 'none',
      lastValidated: null,
      postsPerHour: 0,
      postsPerDay: 0,
    };
  }

  return {
    platform,
    account: accountId,
    session: (await isSessionFresh(platform, accountId)) ? 'fresh' : 'stale',
    lastValidated: meta.lastValidated,
    postsPerHour: await countRecent(platform, accountId, 'post', 60 * 60 * 1000),
    postsPerDay: await countRecent(platform, accountId, 'post', 24 * 60 * 60 * 1000),
  };
}

async function buildStatus(accountId: string | undefined): Promise<StatusRow[]> {
  const pairs: Array<[PostingPlatform, string]> = [];

  if (accountId !== undefined) {
    for (const platform of POSTING_PLATFORMS) pairs.push([platform, accountId]);
  } else {
    for (const platform of POSTING_PLATFORMS) {
      const accounts = await getAccountsForPlatform(platform);
      for (const account of accounts) pairs.push([platform, account]);
    }
  }

  return Promise.all(pairs.map(([platform, account]) => buildStatusRow(platform, account)));
}

async function invokePost(
  platform: PostingPlatform,
  input: unknown,
  accountId: string,
  launchOptions: LaunchOptions,
  rateLimits: ActionLimits | undefined,
): Promise<PostResult> {
  const mod = (await import(`../platforms/${platform}/index.js`)) as {
    post: (
      input: unknown,
      options: { accountId: string; launchOptions: LaunchOptions; rateLimits?: ActionLimits },
    ) => Promise<PostResult>;
  };

  const options: { accountId: string; launchOptions: LaunchOptions; rateLimits?: ActionLimits } = {
    accountId,
    launchOptions,
  };
  if (rateLimits !== undefined) options.rateLimits = rateLimits;

  return mod.post(input, options);
}

async function buildPostInput(
  platform: PostingPlatform,
  form: FormData,
  runImmediate?: boolean,
): Promise<unknown> {
  const typingSpeed = typingSpeedMultiplier(form);
  const wordPause = wordPauseMaxMs(form);
  switch (platform) {
    case 'tiktok': {
      const tiktokVideoPath = await optionalFileOrSaved(form, 'tiktokVideo', platform);
      const videoPath = tiktokVideoPath ?? (await requireFile(form, 'video', platform));
      const description =
        formString(form, 'tiktokText') ?? formString(form, 'text') ?? formString(form, 'description');
      if (description === undefined) throw new Error('Description is required');
      const coverPath = await optionalFileOrSaved(form, 'cover', platform);
      const productId = formString(form, 'productId');
      const visibility = formString(form, 'visibility');
      const schedule =
        runImmediate === true ? undefined : parseSchedule(formString(form, 'schedule'));
      return {
        videoPath,
        description,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(coverPath !== undefined && { coverPath }),
        ...(productId !== undefined && { productId }),
        ...(visibility !== undefined && { visibility }),
        ...(schedule !== undefined && { schedule }),
        allowComments: formBool(form, 'allowComments'),
        allowDuet: formBool(form, 'allowDuet'),
        allowStitch: formBool(form, 'allowStitch'),
      };
    }
    case 'x': {
      const text = formString(form, 'xText') ?? formString(form, 'text');
      if (text === undefined) throw new Error('Text is required');
      const mediaPaths = await optionalFiles(form, 'media', platform);
      const communityName = formString(form, 'communityName');
      const communityId = formString(form, 'communityId');
      return {
        text,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(mediaPaths.length > 0 && { mediaPaths }),
        ...(communityName !== undefined && { communityName }),
        ...(communityId !== undefined && { communityId }),
      };
    }
    case 'facebook': {
      const pageUrl = formString(form, 'pageUrl');
      const text = formString(form, 'facebookText') ?? formString(form, 'text');
      if (pageUrl === undefined) throw new Error('Facebook page URL is required');
      if (text === undefined) throw new Error('Text is required');
      const facebookImagePath = await optionalFileOrSaved(form, 'facebookImage', platform);
      const imagePath = facebookImagePath ?? (await optionalFileOrSaved(form, 'image', platform));
      const facebookVideoPath = await optionalFileOrSaved(form, 'facebookVideo', platform);
      const videoPath = facebookVideoPath ?? (await optionalFileOrSaved(form, 'video', platform));
      const facebookPostAsRaw = formString(form, 'facebookPostAs');
      let postAs: 'personal' | 'page' = facebookPostAsRaw === 'page' ? 'page' : 'personal';
      const facebookPageName = formString(form, 'facebookPageName');
      if (
        postAs === 'page' &&
        (facebookPageName === undefined || facebookPageName.trim().length === 0)
      ) {
        process.stderr.write(
          '[facebook] postAs=page but no page name provided; will default to personal\n',
        );
        postAs = 'personal';
      }
      return {
        pageUrl,
        text,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(imagePath !== undefined && { imagePath }),
        ...(videoPath !== undefined && { videoPath }),
        postAs,
        ...(facebookPageName !== undefined &&
          facebookPageName.trim().length > 0 && { facebookPageName: facebookPageName.trim() }),
      };
    }
    case 'linkedin': {
      const text = formString(form, 'linkedinText') ?? formString(form, 'text');
      if (text === undefined) throw new Error('Text is required');
      const linkedinImagePath = await optionalFileOrSaved(form, 'linkedinImage', platform);
      const imagePath = linkedinImagePath ?? (await optionalFileOrSaved(form, 'image', platform));
      const target = formString(form, 'linkedinTarget') === 'company' ? 'company' : 'profile';
      const companyPageUrl = formString(form, 'linkedinCompanyPageUrl');
      const linkedinCompanyId = formString(form, 'linkedinCompanyId') || undefined;
      if (target === 'company' && companyPageUrl === undefined && linkedinCompanyId === undefined) {
        throw new Error('LinkedIn company page URL is required');
      }
      const linkedinTitle = formString(form, 'linkedinTitle');
      const linkedinShareIntro = formString(form, 'linkedinShareIntro');
      return {
        text,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(imagePath !== undefined && { imagePath }),
        target,
        ...(companyPageUrl !== undefined && { companyPageUrl }),
        ...(linkedinCompanyId !== undefined && { linkedinCompanyId }),
        ...(linkedinTitle !== undefined && { title: linkedinTitle }),
        ...(linkedinShareIntro !== undefined && { shareIntro: linkedinShareIntro }),
      };
    }
    case 'youtube': {
      const youtubeVideoPath = await optionalFileOrSaved(form, 'youtubeVideo', platform);
      const videoPath = youtubeVideoPath ?? (await requireFile(form, 'video', platform));
      const title = formString(form, 'youtubeBaseTitle') ?? formString(form, 'title');
      if (title === undefined) throw new Error('Title is required');
      const thumbnailPath = await optionalFileOrSaved(form, 'thumbnail', platform);
      const description = formString(form, 'youtubeText') ?? formString(form, 'description');
      const tagsRaw = formString(form, 'tags');
      const playlist = formString(form, 'playlist');
      const visibility = formString(form, 'visibility');
      const schedule =
        runImmediate === true ? undefined : parseSchedule(formString(form, 'schedule'));
      const tags =
        tagsRaw !== undefined
          ? tagsRaw
              .split(',')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          : [];
      return {
        videoPath,
        title,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(thumbnailPath !== undefined && { thumbnailPath }),
        ...(description !== undefined && { description }),
        ...(tags.length > 0 && { tags }),
        ...(playlist !== undefined && { playlist }),
        ...(visibility !== undefined && { visibility }),
        ...(schedule !== undefined && { schedule }),
        ...(formBool(form, 'madeForKids') && { madeForKids: true }),
      };
    }
    case 'instagram': {
      const instagramImagePath = await optionalFileOrSaved(form, 'instagramImage', platform);
      const imagePath = instagramImagePath ?? (await requireFile(form, 'image', platform));
      const instagramVideoPath = await optionalFileOrSaved(form, 'instagramVideo', platform);
      const videoPath = instagramVideoPath ?? (await optionalFileOrSaved(form, 'video', platform));
      const caption = formString(form, 'instagramText') ?? formString(form, 'caption');
      return {
        imagePath,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(caption !== undefined && { caption }),
        ...(videoPath !== undefined && { videoPath }),
      };
    }
  }
}

async function runPost(form: FormData): Promise<PostResult> {
  const platformRaw = formString(form, 'platform');
  const accountId = formString(form, 'account');
  if (!isPostingPlatform(platformRaw)) throw new Error('Choose a supported platform');
  if (accountId === undefined) throw new Error('Account is required');
  assertNoManualVerifyForAutomaticPost(accountId);

  acquirePostingLock(accountId);
  try {
    return await invokePost(
      platformRaw,
      await buildPostInput(platformRaw, form, true),
      accountId,
      await buildLaunchOptions(platformRaw, accountId, form),
      buildRateLimits(form),
    );
  } finally {
    releasePostingLock(accountId);
  }
}

function textForCampaign(form: FormData): string | undefined {
  return formString(form, 'text') ?? formString(form, 'description') ?? formString(form, 'title');
}

function parseSeconds(value: string | undefined, label: string, defaultSeconds: number): number {
  const raw = value?.trim();
  if (raw === undefined || raw.length === 0) return defaultSeconds;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > MAX_CAMPAIGN_DELAY_SECONDS) {
    throw new Error(`${label} must be between 0 and ${MAX_CAMPAIGN_DELAY_SECONDS} seconds`);
  }

  return seconds;
}

export function parseCampaignDelayMs(value: string | undefined): number {
  return Math.round(
    parseSeconds(value, 'Delay between platforms', DEFAULT_CAMPAIGN_DELAY_MIN_SECONDS) * 1000,
  );
}

export function parseCampaignDelayRangeMs(
  minValue: string | undefined,
  maxValue: string | undefined,
  legacyValue?: string | undefined,
): { minMs: number; maxMs: number } {
  if (
    (minValue === undefined || minValue.trim().length === 0) &&
    (maxValue === undefined || maxValue.trim().length === 0) &&
    legacyValue !== undefined
  ) {
    const ms = parseCampaignDelayMs(legacyValue);
    return { minMs: ms, maxMs: ms };
  }

  const minSeconds = parseSeconds(
    minValue,
    'Minimum delay between platforms',
    DEFAULT_CAMPAIGN_DELAY_MIN_SECONDS,
  );
  const maxSeconds = parseSeconds(
    maxValue,
    'Maximum delay between platforms',
    DEFAULT_CAMPAIGN_DELAY_MAX_SECONDS,
  );
  if (maxSeconds < minSeconds) {
    throw new Error(
      'Maximum delay between platforms must be greater than or equal to minimum delay',
    );
  }

  return { minMs: Math.round(minSeconds * 1000), maxMs: Math.round(maxSeconds * 1000) };
}

export function shouldStopCampaignAfterError(error: string): boolean {
  const normalized = error.toLowerCase();
  return SAFETY_STOP_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function randomDelayMs(range: { minMs: number; maxMs: number }): number {
  if (range.maxMs <= range.minMs) return range.minMs;
  return range.minMs + Math.floor(Math.random() * (range.maxMs - range.minMs + 1));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendSafetySkippedResults(
  results: CampaignResult[],
  targets: PostingPlatform[],
  currentIndex: number,
): void {
  for (const skipped of targets.slice(currentIndex + 1)) {
    results.push({
      platform: skipped,
      ok: false,
      status: 'skipped',
      error:
        'Skipped after a platform checkpoint or safety warning. Review the account manually before continuing.',
    });
  }
}

function parseOptionalInt(
  value: string | undefined,
  label: string,
  min: number,
  max: number,
): number | undefined {
  const raw = value?.trim();
  if (raw === undefined || raw.length === 0) return undefined;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function typingSpeedMultiplier(form: FormData): number {
  const percent =
    parseOptionalInt(
      formString(form, 'typingSpeedPercent'),
      'Typing speed',
      MIN_TYPING_SPEED_PERCENT,
      MAX_TYPING_SPEED_PERCENT,
    ) ?? DEFAULT_TYPING_SPEED_PERCENT;
  return percent / 100;
}

function wordPauseMaxMs(form: FormData): number {
  return (
    parseOptionalInt(
      formString(form, 'wordPauseMaxMs'),
      'Word pause',
      MIN_WORD_PAUSE_MAX_MS,
      MAX_WORD_PAUSE_MAX_MS,
    ) ?? DEFAULT_WORD_PAUSE_MAX_MS
  );
}

function buildRateLimits(form: FormData): ActionLimits | undefined {
  const perHour = parseOptionalInt(
    formString(form, 'postLimitPerHour'),
    'Post cap per hour',
    0,
    MAX_POST_LIMIT,
  );
  const perDay = parseOptionalInt(
    formString(form, 'postLimitPerDay'),
    'Post cap per day',
    0,
    MAX_POST_LIMIT,
  );
  if ((perHour === undefined || perHour === 0) && (perDay === undefined || perDay === 0)) {
    return undefined;
  }

  return {
    post: {
      ...(perHour !== undefined && perHour > 0 && { perHour }),
      ...(perDay !== undefined && perDay > 0 && { perDay }),
    },
  };
}

export async function buildLaunchOptions(
  platform: PostingPlatform,
  accountId: string,
  form: FormData,
): Promise<LaunchOptions> {
  const launchOptions: LaunchOptions = { platform, accountId };

  const slowMo = parseOptionalInt(
    formString(form, 'slowMoMs'),
    'Browser slow motion',
    0,
    MAX_SLOW_MO_MS,
  );
  if (slowMo !== undefined) launchOptions.slowMo = slowMo;
  launchOptions.spoofFingerprint = await resolveSpoofFingerprintForLaunch(
    optionalFormBool(form, 'spoofFingerprint'),
  );

  return launchOptions;
}

function campaignTags(form: FormData): string[] {
  return (formString(form, 'tags') ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function buildCampaignInput(
  platform: PostingPlatform,
  form: FormData,
  assets: CampaignAssets,
  runImmediate?: boolean,
): unknown {
  const text = textForCampaign(form);
  const title = formString(form, 'title') ?? text?.slice(0, 100);
  const description = formString(form, 'description') ?? text;
  const schedule = runImmediate === true ? undefined : parseSchedule(formString(form, 'schedule'));
  const typingSpeed = typingSpeedMultiplier(form);
  const wordPause = wordPauseMaxMs(form);

  switch (platform) {
    case 'tiktok': {
      const videoPath = assets.platformVideos?.['tiktok'] ?? assets.videoPath;
      if (videoPath === undefined) throw new Error('Video is required for TikTok');
      const tiktokDescription =
        formString(form, 'tiktokText') ?? formString(form, 'text') ?? description;
      if (tiktokDescription === undefined)
        throw new Error('Text or description is required for TikTok');
      const productId = formString(form, 'productId');
      return {
        videoPath,
        description: tiktokDescription,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(assets.coverPath !== undefined && { coverPath: assets.coverPath }),
        visibility: formString(form, 'tiktokVisibility') ?? 'everyone',
        ...(productId !== undefined && { productId }),
        ...(schedule !== undefined && { schedule }),
        allowComments: formBool(form, 'allowComments'),
        allowDuet: formBool(form, 'allowDuet'),
        allowStitch: formBool(form, 'allowStitch'),
      };
    }
    case 'x': {
      const xText = formString(form, 'xText') ?? text;
      if (xText === undefined) throw new Error('Text is required for X');
      const mediaPaths = [assets.videoPath, assets.imagePath].filter(
        (item): item is string => item !== undefined,
      );
      const communityName = formString(form, 'communityName');
      const communityId = formString(form, 'communityId');
      return {
        text: xText,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(mediaPaths.length > 0 && { mediaPaths }),
        ...(communityName !== undefined && { communityName }),
        ...(communityId !== undefined && { communityId }),
      };
    }
    case 'facebook': {
      const facebookText = formString(form, 'facebookText') ?? text;
      const pageUrl = formString(form, 'pageUrl');
      if (pageUrl === undefined) throw new Error('Facebook page URL is required');
      if (facebookText === undefined) throw new Error('Text is required for Facebook');
      const facebookPostAsRaw = formString(form, 'facebookPostAs');
      let postAs: 'personal' | 'page' = facebookPostAsRaw === 'page' ? 'page' : 'personal';
      const facebookPageName = formString(form, 'facebookPageName');
      if (
        postAs === 'page' &&
        (facebookPageName === undefined || facebookPageName.trim().length === 0)
      ) {
        process.stderr.write(
          '[facebook] postAs=page but no page name provided; will default to personal\n',
        );
        postAs = 'personal';
      }
      const facebookImagePath = assets.platformImages?.['facebook'] ?? assets.imagePath;
      const facebookVideoPath = assets.platformVideos?.['facebook'] ?? assets.videoPath;
      return {
        pageUrl,
        text: facebookText,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(facebookImagePath !== undefined && { imagePath: facebookImagePath }),
        ...(facebookVideoPath !== undefined && { videoPath: facebookVideoPath }),
        postAs,
        ...(facebookPageName !== undefined &&
          facebookPageName.trim().length > 0 && { facebookPageName: facebookPageName.trim() }),
      };
    }
    case 'linkedin': {
      const linkedinText = formString(form, 'linkedinText') ?? text;
      if (linkedinText === undefined) throw new Error('Text is required for LinkedIn');
      const target = formString(form, 'linkedinTarget') === 'company' ? 'company' : 'profile';
      const companyPageUrl = formString(form, 'linkedinCompanyPageUrl');
      const linkedinCompanyId = formString(form, 'linkedinCompanyId') || undefined;
      if (target === 'company' && companyPageUrl === undefined && linkedinCompanyId === undefined) {
        throw new Error('LinkedIn company page URL is required');
      }
      const linkedinPostType =
        formString(form, 'linkedinPostType') === 'article' ? 'article' : 'post';
      const linkedinTitle = formString(form, 'linkedinTitle');
      const linkedinShareIntro = formString(form, 'linkedinShareIntro');
      const linkedinImagePath = assets.platformImages?.['linkedin'] ?? assets.imagePath;
      return {
        text: linkedinText,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(linkedinImagePath !== undefined && { imagePath: linkedinImagePath }),
        target,
        ...(companyPageUrl !== undefined && { companyPageUrl }),
        ...(linkedinCompanyId !== undefined && { linkedinCompanyId }),
        linkedinPostType,
        ...(linkedinTitle !== undefined && { title: linkedinTitle }),
        ...(linkedinShareIntro !== undefined && { shareIntro: linkedinShareIntro }),
      };
    }
    case 'youtube': {
      const youtubeTitle = formString(form, 'youtubeBaseTitle') ?? title;
      const youtubeDescription = formString(form, 'youtubeText') ?? description;
      const youtubeVideoPath = assets.platformVideos?.['youtube'] ?? assets.videoPath;
      if (youtubeVideoPath === undefined) throw new Error('Video is required for YouTube');
      if (youtubeTitle === undefined) throw new Error('Title is required for YouTube');
      const tags = campaignTags(form);
      const playlist = formString(form, 'playlist');
      return {
        videoPath: youtubeVideoPath,
        title: youtubeTitle,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(youtubeDescription !== undefined && { description: youtubeDescription }),
        ...(assets.thumbnailPath !== undefined && { thumbnailPath: assets.thumbnailPath }),
        ...(tags.length > 0 && { tags }),
        ...(playlist !== undefined && { playlist }),
        visibility: formString(form, 'youtubeVisibility') ?? 'private',
        ...(schedule !== undefined && { schedule }),
        ...(formBool(form, 'madeForKids') && { madeForKids: true }),
      };
    }
    case 'instagram': {
      const instagramCaption = formString(form, 'instagramText') ?? text;
      const instagramImagePath = assets.platformImages?.['instagram'] ?? assets.imagePath;
      const instagramVideoPath = assets.platformVideos?.['instagram'] ?? assets.videoPath;
      if (instagramImagePath === undefined) throw new Error('Image is required for Instagram');
      return {
        imagePath: instagramImagePath,
        typingSpeedMultiplier: typingSpeed,
        wordPauseMaxMs: wordPause,
        ...(instagramVideoPath !== undefined && { videoPath: instagramVideoPath }),
        ...(instagramCaption !== undefined && { caption: instagramCaption }),
      };
    }
  }
}

export function buildManualCampaignInput(
  platform: ManualVerifyPlatform,
  form: FormData,
  assets: CampaignAssets,
): unknown {
  const input = buildCampaignInput(platform, form, assets, true);
  if (typeof input !== 'object' || input === null) return input;
  return { ...input, dryRun: true };
}

async function isManualPlatformLoggedIn(
  platform: ManualVerifyPlatform,
  page: Page,
): Promise<boolean> {
  switch (platform) {
    case 'facebook': {
      const auth = (await import('../platforms/facebook/auth.js')) as {
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      return auth.isLoggedIn(page);
    }
    case 'instagram': {
      const auth = (await import('../platforms/instagram/auth.js')) as {
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      return auth.isLoggedIn(page);
    }
    case 'linkedin': {
      const auth = (await import('../platforms/linkedin/auth.js')) as {
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      return auth.isLoggedIn(page);
    }
    case 'x': {
      const auth = (await import('../platforms/x/auth.js')) as {
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      return auth.isLoggedIn(page);
    }
  }
}

async function composeManualPlatform(
  platform: ManualVerifyPlatform,
  page: Page,
  input: unknown,
): Promise<void> {
  switch (platform) {
    case 'facebook': {
      const composer = (await import('../platforms/facebook/compose.js')) as {
        createPost: (page: Page, input: unknown) => Promise<unknown>;
      };
      await composer.createPost(page, input);
      return;
    }
    case 'instagram': {
      const composer = (await import('../platforms/instagram/composer.js')) as {
        createPost: (page: Page, input: unknown) => Promise<unknown>;
      };
      await composer.createPost(page, input);
      return;
    }
    case 'linkedin': {
      const composer = (await import('../platforms/linkedin/compose.js')) as {
        createPost: (page: Page, input: unknown) => Promise<unknown>;
      };
      await composer.createPost(page, input);
      return;
    }
    case 'x': {
      const composer = (await import('../platforms/x/compose.js')) as {
        postTweet: (page: Page, input: unknown) => Promise<unknown>;
      };
      await composer.postTweet(page, input);
      return;
    }
  }
}

function getManualVerifyDriver(): ManualVerifyDriver {
  return (
    manualVerifyDriverOverride ?? {
      launch: launchBrowser,
      isLoggedIn: isManualPlatformLoggedIn,
      compose: composeManualPlatform,
      markValidated: markUserDataDirValidated,
    }
  );
}

async function collectCampaignAssets(form: FormData): Promise<CampaignAssets> {
  const bucket = `campaign-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const imagePath = await optionalFileOrSaved(form, 'image', bucket);
  const videoPath = await optionalFileOrSaved(form, 'video', bucket);
  const coverPath = await optionalFileOrSaved(form, 'cover', bucket);
  const thumbnailPath = await optionalFileOrSaved(form, 'thumbnail', bucket);
  const platforms = ['linkedin', 'x', 'facebook', 'instagram', 'tiktok', 'youtube'] as const;
  const platformImages: Partial<Record<PostingPlatform, string>> = {};
  const platformVideos: Partial<Record<PostingPlatform, string>> = {};
  for (const platform of platforms) {
    // 1. Explicit per-platform upload wins.
    let img = await optionalFileOrSaved(form, `${platform}Image`, platform);
    if (img === undefined) {
      // 2. Auto-generated variant from image resize (savedImageAuto<Platform>Path).
      const autoKey = `imageAuto${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
      img = await savedFilePath(form, autoKey).catch(() => undefined);
    }
    if (img !== undefined) platformImages[platform] = img;
    const vid = await optionalFileOrSaved(form, `${platform}Video`, platform);
    if (vid !== undefined) platformVideos[platform] = vid;
  }
  return {
    ...(imagePath !== undefined && { imagePath }),
    ...(videoPath !== undefined && { videoPath }),
    ...(coverPath !== undefined && { coverPath }),
    ...(thumbnailPath !== undefined && { thumbnailPath }),
    platformImages,
    platformVideos,
  };
}

async function runCampaignNow(
  form: FormData,
  assets: CampaignAssets,
  historyMeta: { queueId?: string; scheduledAt?: string } = {},
  runImmediate?: boolean,
): Promise<{ ok: boolean; results: CampaignResult[] }> {
  const accountId = campaignAccount(form);
  assertNoManualVerifyForAutomaticPost(accountId);
  acquirePostingLock(accountId);
  try {
    const targets = campaignTargets(form);
    await appendRunLog({
      account: accountId,
      scope: 'campaign',
      level: 'info',
      message: `Live posting started for ${targets.length} platform${targets.length === 1 ? '' : 's'}`,
      detail: targets.join(', '),
    });
    const delayRange = parseCampaignDelayRangeMs(
      formString(form, 'campaignDelayMinSeconds'),
      formString(form, 'campaignDelayMaxSeconds'),
      formString(form, 'campaignDelaySeconds'),
    );
    const rateLimits = buildRateLimits(form);
    const results: CampaignResult[] = [];
    const preview = textPreview(textForCampaign(form));

    for (const [index, platform] of targets.entries()) {
      let attemptedPost = false;
      try {
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'campaign',
          level: 'info',
          message: 'Preparing live post',
        });
        const input = buildCampaignInput(platform, form, assets, runImmediate);
        attemptedPost = true;
        const launchOptions = await buildLaunchOptions(platform, accountId, form);
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'campaign',
          level: 'info',
          message: 'Opening browser and composer',
        });
        const result = await invokePost(platform, input, accountId, launchOptions, rateLimits);
        const resultDetail = result.ok
          ? result.url
          : [result.error, result.debugArtifacts?.summary].filter(Boolean).join('\n') || undefined;
        results.push({
          platform,
          ok: result.ok,
          status: result.ok ? 'posted' : 'failed',
          ...(result.url !== undefined && { url: result.url }),
          ...(result.error !== undefined && { error: result.error }),
          ...(resultDetail !== undefined && { detail: resultDetail }),
        });
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'campaign',
          level: result.ok ? 'success' : 'error',
          message: result.ok ? 'Live post completed' : 'Live post failed',
          ...(resultDetail !== undefined && { detail: resultDetail }),
        });

        if (
          !result.ok &&
          result.error !== undefined &&
          shouldStopCampaignAfterError(result.error)
        ) {
          appendSafetySkippedResults(results, targets, index);
          break;
        }
      } catch (err) {
        results.push({
          platform,
          ok: false,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'campaign',
          level: 'error',
          message: 'Live post failed',
          detail: err instanceof Error ? err.message : String(err),
        });

        const error = results.at(-1)?.error ?? '';
        if (shouldStopCampaignAfterError(error)) {
          appendSafetySkippedResults(results, targets, index);
          break;
        }
      }

      const delayMs = randomDelayMs(delayRange);
      if (attemptedPost && index < targets.length - 1 && delayMs > 0) {
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'campaign',
          level: 'info',
          message: 'Waiting before next platform',
          detail: `${Math.round(delayMs / 1000)} seconds`,
        });
        await delay(delayMs);
      }
    }

    await appendHistory(historyFromResults(results, accountId, preview, historyMeta));
    await appendRunLog({
      account: accountId,
      scope: 'campaign',
      level: results.every((result) => result.ok) ? 'success' : 'warn',
      message: 'Live posting finished',
      detail: `${results.filter((result) => result.ok).length}/${results.length} succeeded`,
    });
    return { ok: results.every((result) => result.ok), results };
  } finally {
    releasePostingLock(accountId);
  }
}

async function runCampaign(
  form: FormData,
): Promise<{ ok: boolean; queued?: boolean; queue?: QueueEntry[]; results: CampaignResult[] }> {
  const assets = await collectCampaignAssets(form);
  const schedule = parseSchedule(formString(form, 'schedule'));
  if (schedule !== undefined && schedule.at.getTime() > Date.now()) {
    const entry = await enqueueCampaign(form, assets, schedule);
    await appendRunLog({
      account: entry.account,
      scope: 'queue',
      level: 'success',
      message: 'Campaign queued',
      detail: `${entry.targets.join(', ')} at ${entry.scheduledAt}`,
    });
    return { ok: true, queued: true, queue: [entry], results: queueResults(entry) };
  }

  // Schedule is absent or stale (past) — run immediately without forwarding the schedule field
  const runImmediate = schedule !== undefined;
  return runCampaignNow(form, assets, {}, runImmediate);
}

async function runManualCampaign(
  form: FormData,
): Promise<{ ok: boolean; results: CampaignResult[] }> {
  const accountId = campaignAccount(form);
  assertCanStartManualVerify(accountId);

  const targets = campaignTargets(form);
  await appendRunLog({
    account: accountId,
    scope: 'manual',
    level: 'info',
    message: `Manual prepare requested for ${targets.length} platform${targets.length === 1 ? '' : 's'}`,
    detail: targets.join(', '),
  });
  const unsupported = unsupportedManualVerifyTargets(targets);
  if (unsupported.length > 0) {
    await appendRunLog({
      account: accountId,
      scope: 'manual',
      level: 'error',
      message: 'Manual prepare rejected',
      detail: `Unsupported targets: ${unsupported.join(', ')}`,
    });
    throw new Error(
      `Manual verify currently supports LinkedIn, X, Facebook, and Instagram. Remove: ${unsupported
        .map((platform) => platform)
        .join(', ')}`,
    );
  }

  const manualTargets = targets.filter(isManualVerifyPlatform);
  const assets = await collectCampaignAssets(form);
  const driver = getManualVerifyDriver();
  const ownerPlatform = manualTargets.includes('x') ? 'x' : manualTargets[0];
  if (ownerPlatform === undefined) throw new Error('Choose at least one manual verify platform');

  const launchOptions = await buildLaunchOptions(ownerPlatform, accountId, form);
  await appendRunLog({
    account: accountId,
    scope: 'manual',
    level: 'info',
    message: 'Opening shared manual verification browser',
    detail: `Profile owner: ${ownerPlatform}`,
  });
  const { context, close } = await driver.launch(launchOptions);
  trackManualVerifySession(accountId, context, close);
  await appendRunLog({
    account: accountId,
    scope: 'manual',
    level: 'success',
    message: 'Manual verification browser opened',
    detail: 'Tabs stay open so you can submit manually',
  });

  const existingPages = context.pages();
  const preview = textPreview(textForCampaign(form));
  const results: CampaignResult[] = [];

  for (const [index, platform] of manualTargets.entries()) {
    const page =
      index === 0 ? (existingPages[0] ?? (await context.newPage())) : await context.newPage();

    try {
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'info',
        message: `Preparing tab ${index + 1} of ${manualTargets.length}`,
      });
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'info',
        message: 'Checking logged-in session',
      });
      const loggedIn = await driver.isLoggedIn(platform, page);
      if (!loggedIn) {
        await appendRunLog({
          account: accountId,
          platform,
          scope: 'manual',
          level: 'warn',
          message: 'Platform is not logged in',
          detail: 'Log in in the open tab, then rerun Prepare',
        });
        results.push({
          platform,
          ok: false,
          status: 'failed',
          error: 'not-logged-in',
          detail: 'Not logged in - log in in this tab, then rerun Prepare',
        });
        continue;
      }

      await driver.markValidated(platform, accountId);
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'success',
        message: 'Session validated',
      });
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'info',
        message: 'Opening composer and filling form',
      });
      const input = buildManualCampaignInput(platform, form, assets);
      const inputWithLogger =
        typeof input === 'object' && input !== null
          ? {
              ...input,
              onLog: (message: string, detail?: string) => {
                void appendRunLog({
                  account: accountId,
                  platform,
                  scope: 'manual',
                  level: 'info',
                  message,
                  ...(detail !== undefined && { detail }),
                });
              },
            }
          : input;
      await driver.compose(platform, page, inputWithLogger);
      results.push({
        platform,
        ok: true,
        status: 'prepared',
        detail: 'Form filled - submit manually in browser tab',
      });
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'success',
        message: 'Form filled; waiting for manual submit',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const debugDetail = await captureFailureArtifacts(platform, page)
        .then((artifacts) => artifacts.summary)
        .catch(
          (artifactErr) =>
            `Debug artifact capture failed: ${
              artifactErr instanceof Error ? artifactErr.message : String(artifactErr)
            }`,
        );
      results.push({
        platform,
        ok: false,
        status: 'failed',
        error: errorMessage,
        detail: debugDetail,
      });
      await appendRunLog({
        account: accountId,
        platform,
        scope: 'manual',
        level: 'error',
        message: 'Manual prepare failed',
        detail: `${errorMessage}\n${debugDetail}`,
      });
    }
  }

  await appendHistory(historyFromResults(results, accountId, preview));
  await appendRunLog({
    account: accountId,
    scope: 'manual',
    level: results.every((result) => result.ok) ? 'success' : 'warn',
    message: 'Manual prepare finished',
    detail: `${results.filter((result) => result.ok).length}/${results.length} prepared`,
  });
  return { ok: results.every((result) => result.ok), results };
}

async function runQueuedCampaign(
  entry: QueueEntry,
): Promise<{ ok: boolean; results: CampaignResult[] }> {
  return runCampaignNow(buildStoredCampaignForm(entry), entry.assets, {
    queueId: entry.id,
    scheduledAt: entry.scheduledAt,
  });
}

async function processDueQueue(): Promise<void> {
  if (processingDueQueue) return;
  processingDueQueue = true;

  try {
    const now = Date.now();
    const due = (await loadQueue())
      .filter((entry) => entry.status === 'queued' && Date.parse(entry.scheduledAt) <= now)
      .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));

    for (const queuedEntry of due) {
      if (isManualVerifyActive(queuedEntry.account)) continue;

      const startedAt = new Date().toISOString();
      const postingEntry = await updateQueueEntry(queuedEntry.id, (entry) => ({
        ...entry,
        status: 'posting',
        lastRunAt: startedAt,
      }));

      try {
        const result = await runQueuedCampaign(postingEntry);
        await updateQueueEntry(postingEntry.id, (entry) => ({
          ...entry,
          status: result.ok ? 'posted' : 'failed',
          completedAt: new Date().toISOString(),
          results: result.results,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof ManualVerifyActiveError) {
          await updateQueueEntry(postingEntry.id, (entry) => ({
            ...entry,
            status: 'queued',
            error: message,
          }));
          continue;
        }

        const results = postingEntry.targets.map((platform) => ({
          platform,
          ok: false,
          status: 'failed' as const,
          error: message,
        }));
        await appendHistory(
          historyFromResults(results, postingEntry.account, postingEntry.textPreview, {
            queueId: postingEntry.id,
            scheduledAt: postingEntry.scheduledAt,
          }),
        );
        await updateQueueEntry(postingEntry.id, (entry) => ({
          ...entry,
          status: 'failed',
          completedAt: new Date().toISOString(),
          results,
          error: message,
        }));
      }
    }
  } finally {
    processingDueQueue = false;
  }
}

function startQueueScheduler(): NodeJS.Timeout {
  const timer = setInterval(() => {
    processDueQueue().catch((err: unknown) => {
      const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
      console.error(message);
    });
  }, QUEUE_POLL_INTERVAL_MS);
  timer.unref();
  void processDueQueue();
  return timer;
}

function legacyVariants(accountId: string): string[] {
  const variants = new Set<string>();
  variants.add(accountId); // canonical
  variants.add(encodeURIComponent(accountId)); // URL-encoded
  variants.add(accountId.replace(/\s+/g, '')); // space-stripped
  variants.add(accountId.replace(/\s+/g, '_')); // snake_case
  variants.add(accountId.replace(/\s+/g, '-')); // kebab-case
  variants.delete('');
  return Array.from(variants);
}

export async function deleteAccount(
  accountId: string,
): Promise<{ ok: true; deleted: string[] } | { ok: false; error: string }> {
  if (accountId.length === 0 || accountId.includes('..') || path.isAbsolute(accountId)) {
    return { ok: false, error: 'Invalid account ID' };
  }

  if (legacyVariants(accountId).some(isPostingActive)) {
    return {
      ok: false,
      error: 'A posting flow is active for this account. Wait for it to complete and try again.',
    };
  }

  if (isManualVerifyActive(accountId)) {
    return {
      ok: false,
      error: 'Manual verification browser is currently open for this account. Close it first.',
    };
  }

  for (const flow of loginFlows.values()) {
    if (sameAccount(flow.accountId, accountId)) {
      return {
        ok: false,
        error: 'Browser is currently open for this account. Close it first.',
      };
    }
  }

  const allAccounts = await listKnownAccounts();
  const wouldRemainAfterDelete = allAccounts.filter((a) => !sameAccount(a, accountId));
  if (wouldRemainAfterDelete.length === 0) {
    const uiState = await loadUiState();
    if (sameAccount(uiState.account, accountId)) {
      return {
        ok: false,
        error: 'Cannot delete the last remaining account. Create another account first.',
      };
    }
  }

  const root = getRoot();
  const deleted: string[] = [];

  const safeVariants = legacyVariants(sanitizeAccountId(accountId));

  for (const safe of safeVariants) {
    const fingerprintPath = path.join(root, 'fingerprints', `${safe}.json`);
    try {
      await fs.rm(fingerprintPath, { force: true });
      process.stderr.write(`deleteAccount: removed ${fingerprintPath}\n`);
      deleted.push(fingerprintPath);
    } catch (err) {
      process.stderr.write(`deleteAccount: skipped ${fingerprintPath}: ${String(err)}\n`);
    }

    // New shared profile path (profiles/<safe>)
    const profileDir = path.join(root, 'profiles', safe);
    try {
      await fs.rm(profileDir, { recursive: true, force: true });
      process.stderr.write(`deleteAccount: removed ${profileDir}\n`);
      deleted.push(profileDir);
    } catch (err) {
      process.stderr.write(`deleteAccount: skipped ${profileDir}: ${String(err)}\n`);
    }

    // Legacy per-platform profile paths (profiles/<platform>/<safe>)
    for (const platform of POSTING_PLATFORMS) {
      const legacyProfileDir = path.join(root, 'profiles', platform, safe);
      try {
        await fs.rm(legacyProfileDir, { recursive: true, force: true });
        process.stderr.write(`deleteAccount: removed legacy profile ${legacyProfileDir}\n`);
        deleted.push(legacyProfileDir);
      } catch (err) {
        process.stderr.write(`deleteAccount: skipped ${legacyProfileDir}: ${String(err)}\n`);
      }
    }

    for (const platform of POSTING_PLATFORMS) {
      const sessionFile = path.join(root, 'sessions', platform, `${safe}.json`);
      const metaFile = path.join(root, 'sessions', platform, `${safe}.meta.json`);
      for (const p of [sessionFile, metaFile]) {
        try {
          await fs.rm(p, { force: true });
          process.stderr.write(`deleteAccount: removed ${p}\n`);
          deleted.push(p);
        } catch (err) {
          process.stderr.write(`deleteAccount: skipped ${p}: ${String(err)}\n`);
        }
      }

      const credFile = path.join(root, 'credentials', platform, `${safe}.json`);
      try {
        await fs.rm(credFile, { force: true });
        process.stderr.write(`deleteAccount: removed ${credFile}\n`);
        deleted.push(credFile);
      } catch (err) {
        process.stderr.write(`deleteAccount: skipped ${credFile}: ${String(err)}\n`);
      }

      const blockFile = path.join(root, 'blocks', platform, `${safe}.json`);
      try {
        await fs.rm(blockFile, { force: true });
        process.stderr.write(`deleteAccount: removed ${blockFile}\n`);
        deleted.push(blockFile);
      } catch (err) {
        process.stderr.write(`deleteAccount: skipped ${blockFile}: ${String(err)}\n`);
      }

      const ledgerFile = path.join(root, 'ledger', platform, `${safe}.json`);
      try {
        await fs.rm(ledgerFile, { force: true });
        process.stderr.write(`deleteAccount: removed ${ledgerFile}\n`);
        deleted.push(ledgerFile);
      } catch (err) {
        process.stderr.write(`deleteAccount: skipped ${ledgerFile}: ${String(err)}\n`);
      }

      // Legacy archived profile dirs written by migrateProfileDirIfNeeded
      const profilesLegacyDir = path.join(root, 'profiles-legacy', `${platform}-${safe}`);
      try {
        await fs.rm(profilesLegacyDir, { recursive: true, force: true });
        process.stderr.write(`deleteAccount: removed ${profilesLegacyDir}\n`);
        deleted.push(profilesLegacyDir);
      } catch (err) {
        process.stderr.write(`deleteAccount: skipped ${profilesLegacyDir}: ${String(err)}\n`);
      }
    }
  }

  try {
    const history = await loadHistory();
    const keptHistory = history.filter((entry) => !sameAccount(entry.account, accountId));
    if (keptHistory.length !== history.length) await saveHistory(keptHistory);

    const queue = await loadQueue();
    const keptQueue = queue.filter((entry) => !sameAccount(entry.account, accountId));
    if (keptQueue.length !== queue.length) await saveQueue(keptQueue);
  } catch {
    // Non-fatal: account file deletion still needs to proceed.
  }

  // Move the UI away from the deleted account so a later refresh cannot
  // repopulate the account picker from stale saved state.
  try {
    const uiState = await loadUiState();
    if (sameAccount(uiState.account, accountId)) {
      const nextAccount = wouldRemainAfterDelete[0] ?? '';
      await saveUiState({ ...uiState, account: nextAccount });
    }
  } catch {
    // Non-fatal: state.json update is best-effort
  }

  return { ok: true, deleted };
}

async function startLogin(
  platform: PostingPlatform,
  accountId: string,
  _useBrowserProfile: boolean,
  spoofFingerprint?: unknown,
): Promise<string> {
  if (isManualVerifyActive(accountId)) {
    throw new Error('Manual verification browser is open for this account. Close it first.');
  }

  for (const [flowId, flow] of loginFlows) {
    if (flow.platform === platform && flow.accountId === accountId) {
      await flow.close().catch(() => undefined);
      loginFlows.delete(flowId);
    }
  }

  const launchOptions: LaunchOptions = {
    platform,
    accountId,
    spoofFingerprint: await resolveSpoofFingerprintForLaunch(spoofFingerprint),
  };

  const { context, close } = await launchBrowser(launchOptions);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(LOGIN_URLS[platform], { waitUntil: 'domcontentloaded' });

  const flowId = randomUUID();
  loginFlows.set(flowId, {
    platform,
    accountId,
    context,
    page,
    close,
    startedAt: Date.now(),
  });
  return flowId;
}

async function finishLogin(flowId: string): Promise<void> {
  const flow = loginFlows.get(flowId);
  if (flow === undefined) throw new Error('Login flow was not found');

  const loggedIn = await verifyLogin(flowId);
  if (!loggedIn) {
    throw new Error(
      `Could not verify the ${flow.platform} session yet. The account still appears logged out.`,
    );
  }

  await saveLogin(flowId);
}

async function verifyLogin(flowId: string): Promise<boolean> {
  const flow = loginFlows.get(flowId);
  if (flow === undefined) throw new Error('Login flow was not found');

  const authModule = (await import(`../platforms/${flow.platform}/auth.js`)) as {
    isLoggedIn?: (page: Page) => Promise<boolean>;
  };
  const loggedIn = await authModule.isLoggedIn?.(flow.page);
  return loggedIn === true;
}

async function saveLogin(flowId: string): Promise<void> {
  const flow = loginFlows.get(flowId);
  if (flow === undefined) throw new Error('Login flow was not found');

  await markUserDataDirValidated(flow.platform, flow.accountId);
  await flow.close();
  loginFlows.delete(flowId);
}

async function cancelLogin(flowId: string): Promise<void> {
  const flow = loginFlows.get(flowId);
  if (flow === undefined) return;
  await flow.close().catch(() => undefined);
  loginFlows.delete(flowId);
}

async function submitCredentialLogin(
  platform: PostingPlatform,
  page: Page,
  identity: string,
  password: string,
): Promise<boolean> {
  switch (platform) {
    case 'facebook': {
      const authModule = (await import('../platforms/facebook/auth.js')) as {
        loginWithCredentials: (page: Page, email: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    case 'instagram': {
      const authModule = (await import('../platforms/instagram/auth.js')) as {
        loginWithCredentials: (page: Page, username: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    case 'linkedin': {
      const authModule = (await import('../platforms/linkedin/auth.js')) as {
        loginWithCredentials: (page: Page, username: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    case 'tiktok': {
      const authModule = (await import('../platforms/tiktok/auth.js')) as {
        loginWithCredentials: (page: Page, username: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    case 'x': {
      const authModule = (await import('../platforms/x/auth.js')) as {
        loginWithCredentials: (page: Page, username: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    case 'youtube': {
      const authModule = (await import('../platforms/youtube/auth.js')) as {
        loginWithCredentials: (page: Page, email: string, password: string) => Promise<void>;
        isLoggedIn: (page: Page) => Promise<boolean>;
      };
      await authModule.loginWithCredentials(page, identity, password);
      return authModule.isLoggedIn(page);
    }
    default:
      throw new Error('Choose a supported platform');
  }
}

async function startCredentialLogin(
  platform: PostingPlatform,
  accountId: string,
  identity: string,
  password: string,
  _useBrowserProfile: boolean,
  spoofFingerprint?: unknown,
): Promise<{ saved: boolean; flowId?: string }> {
  if (identity.trim().length === 0) throw new Error('Email or username is required');
  if (password.length === 0) throw new Error('Password is required');
  if (isManualVerifyActive(accountId)) {
    throw new Error('Manual verification browser is open for this account. Close it first.');
  }

  for (const [flowId, flow] of loginFlows) {
    if (flow.platform === platform && flow.accountId === accountId) {
      await flow.close().catch(() => undefined);
      loginFlows.delete(flowId);
    }
  }

  const launchOptions: LaunchOptions = {
    platform,
    accountId,
    spoofFingerprint: await resolveSpoofFingerprintForLaunch(spoofFingerprint),
  };

  const { context, close } = await launchBrowser(launchOptions);
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    const loggedIn = await submitCredentialLogin(platform, page, identity.trim(), password);
    if (loggedIn) {
      await markUserDataDirValidated(platform, accountId);
      await close();
      return { saved: true };
    }

    const flowId = randomUUID();
    loginFlows.set(flowId, {
      platform,
      accountId,
      context,
      page,
      close,
      startedAt: Date.now(),
    });
    return { saved: false, flowId };
  } catch (err) {
    await close().catch(() => undefined);
    throw err;
  }
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://signal-fire.local');

  if (req.method === 'GET' && url.pathname === '/') {
    sendHtml(res, REDESIGNED_APP_HTML);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    sendJson(res, 200, { ok: true, state: await loadUiState() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/state') {
    await saveUiState(await readJson<UiState>(req));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/draft-file') {
    const { file, imageResizeError } = await saveDraftFile(await readForm(req));
    sendJson(res, 200, { ok: true, file, ...(imageResizeError !== undefined && { imageResizeError }) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/draft-file') {
    const rawPath = url.searchParams.get('path') ?? '';
    const resolvedPath = path.resolve(rawPath);
    if (!isPathInside(getUploadRoot(), resolvedPath)) {
      throw new Error('Draft file path is outside the signal-fire uploads folder');
    }
    const data = await fs.readFile(resolvedPath);
    res.writeHead(200, {
      'content-type': contentTypeForPath(resolvedPath),
      'content-length': data.byteLength,
    });
    res.end(data);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/history') {
    const account = url.searchParams.get('account')?.trim() || undefined;
    const history = await loadHistory();
    sendJson(res, 200, {
      ok: true,
      entries:
        account === undefined ? history : history.filter((entry) => entry.account === account),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/history/clear') {
    await saveHistory([]);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const account = url.searchParams.get('account')?.trim() || undefined;
    sendJson(res, 200, {
      ok: true,
      entries: runLogsForClient(await loadRunLog(), account),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/logs/clear') {
    await clearRunLog();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/queue') {
    const account = url.searchParams.get('account')?.trim() || undefined;
    const queue = await loadQueue();
    sendJson(res, 200, {
      ok: true,
      entries: (account === undefined
        ? queue
        : queue.filter((entry) => entry.account === account)
      ).map(queueEntryForClient),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/queue') {
    const form = await readForm(req);
    const schedule = parseSchedule(formString(form, 'schedule'));
    if (schedule === undefined) throw new Error('Choose a schedule time to queue');
    const entry = await enqueueCampaign(form, await collectCampaignAssets(form), schedule);
    sendJson(res, 200, { ok: true, entry: queueEntryForClient(entry) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/queue/cancel') {
    const body = await readJson<{ id?: unknown }>(req);
    if (typeof body.id !== 'string' || body.id.trim().length === 0) {
      throw new Error('Queue item is required');
    }
    const entry = await updateQueueEntry(body.id, (existing) => {
      if (existing.status !== 'queued') {
        throw new Error('Only queued items can be canceled');
      }
      return { ...existing, status: 'canceled', completedAt: new Date().toISOString() };
    });
    sendJson(res, 200, { ok: true, entry: queueEntryForClient(entry) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const account = url.searchParams.get('account')?.trim() || undefined;
    sendJson(res, 200, { ok: true, rows: await buildStatus(account) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/accounts') {
    sendJson(res, 200, { ok: true, accounts: await listKnownAccounts() });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/start') {
    const body = await readJson<{
      platform?: unknown;
      account?: unknown;
      useBrowserProfile?: unknown;
      spoofFingerprint?: unknown;
    }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    const flowId = await startLogin(
      body.platform,
      accountId,
      body.useBrowserProfile === true,
      body.spoofFingerprint,
    );
    sendJson(res, 200, { ok: true, flowId });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/login/active') {
    const platform = url.searchParams.get('platform');
    const accountId = url.searchParams.get('account')?.trim() ?? '';
    if (!isPostingPlatform(platform)) throw new Error('Choose a supported platform');
    if (accountId.length === 0) throw new Error('Account is required');
    sendJson(res, 200, { ok: true, flowId: findLoginFlowId(platform, accountId) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/finish') {
    const body = await readJson<{ flowId?: unknown }>(req);
    if (typeof body.flowId !== 'string') throw new Error('Login flow is required');
    await finishLogin(body.flowId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/verify') {
    const body = await readJson<{ flowId?: unknown }>(req);
    if (typeof body.flowId !== 'string') throw new Error('Login flow is required');
    sendJson(res, 200, { ok: true, loggedIn: await verifyLogin(body.flowId) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/save') {
    const body = await readJson<{ flowId?: unknown }>(req);
    if (typeof body.flowId !== 'string') throw new Error('Login flow is required');
    await saveLogin(body.flowId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/cancel') {
    const body = await readJson<{ flowId?: unknown }>(req);
    if (typeof body.flowId === 'string') await cancelLogin(body.flowId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/credentials') {
    const platform = url.searchParams.get('platform');
    const accountId = url.searchParams.get('account')?.trim() ?? '';
    if (!isPostingPlatform(platform)) throw new Error('Choose a supported platform');
    if (accountId.length === 0) throw new Error('Account is required');
    const credentials = await readStoredCredentials(platform, accountId);
    sendJson(res, 200, { ok: true, credentials });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/credentials') {
    const body = await readJson<{
      platform?: unknown;
      account?: unknown;
      identity?: unknown;
      password?: unknown;
    }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    if (typeof body.identity !== 'string') throw new Error('Email or username is required');
    if (typeof body.password !== 'string') throw new Error('Password is required');
    const credentials = await writeStoredCredentials({
      platform: body.platform,
      accountId,
      identity: body.identity,
      password: body.password,
    });
    sendJson(res, 200, { ok: true, credentials });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/credentials/clear') {
    const body = await readJson<{ platform?: unknown; account?: unknown }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    await clearStoredCredentials(body.platform, accountId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login/credentials') {
    const body = await readJson<{
      platform?: unknown;
      account?: unknown;
      identity?: unknown;
      password?: unknown;
      useBrowserProfile?: unknown;
      spoofFingerprint?: unknown;
    }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    if (typeof body.identity !== 'string') throw new Error('Email or username is required');
    if (typeof body.password !== 'string') throw new Error('Password is required');
    await writeStoredCredentials({
      platform: body.platform,
      accountId,
      identity: body.identity,
      password: body.password,
    });
    const result = await startCredentialLogin(
      body.platform,
      accountId,
      body.identity,
      body.password,
      body.useBrowserProfile === true,
      body.spoofFingerprint,
    );
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/session/verify') {
    const body = await readJson<{ platform?: unknown; account?: unknown }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    await markUserDataDirValidated(body.platform, accountId as AccountId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/session/clear') {
    const body = await readJson<{ platform?: unknown; account?: unknown }>(req);
    if (!isPostingPlatform(body.platform)) throw new Error('Choose a supported platform');
    const accountId = typeof body.account === 'string' ? body.account.trim() : '';
    if (accountId.length === 0) throw new Error('Account is required');
    await clearSession(body.platform, accountId as AccountId);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/account/delete') {
    const body = await readJson<{ accountId?: unknown }>(req);
    const accountId = typeof body.accountId === 'string' ? body.accountId.trim() : '';
    if (accountId.length === 0) throw new Error('Account ID is required');
    const result = await deleteAccount(accountId);
    sendJson(res, result.ok ? 200 : 409, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/post') {
    const result = await runPost(await readForm(req));
    sendJson(res, result.ok ? 200 : 422, result);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/campaign') {
    const result = await runCampaign(await readForm(req));
    sendJson(res, 200, {
      ok: true,
      campaignOk: result.ok,
      results: result.results,
      ...(result.queued === true && { queued: true }),
      ...(result.queue !== undefined && { queue: result.queue.map(queueEntryForClient) }),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/campaign/manual') {
    const result = await runManualCampaign(await readForm(req));
    sendJson(res, 200, {
      ok: true,
      campaignOk: result.ok,
      results: result.results,
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found' });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await route(req, res);
  } catch (err) {
    void appendRunLog({
      scope: 'system',
      level: 'error',
      message: `${req.method ?? 'REQUEST'} ${req.url ?? ''} failed`,
      detail: err instanceof Error ? err.message : String(err),
    });
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

async function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(typeof address === 'object' && address !== null ? address.port : port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export function isRetryableListenError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}

export function getUiPortCandidates(preferredPort: number): number[] {
  if (preferredPort === 0) return [0];

  const candidates: number[] = [];
  for (let attempt = 0; attempt < UI_PORT_SEARCH_ATTEMPTS; attempt++) {
    const port = preferredPort + attempt;
    if (port > 65_535) break;
    candidates.push(port);
  }
  candidates.push(0);
  return candidates;
}

function formatPortCandidate(port: number): string {
  return port === 0 ? 'an OS-assigned port' : String(port);
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  await migrateLegacyAccountIds();

  const host = options.host ?? '127.0.0.1';
  const preferredPort = options.port ?? 4317;

  for (const port of getUiPortCandidates(preferredPort)) {
    const server = createServer((req, res) => {
      void handle(req, res);
    });

    try {
      const actualPort = await listen(server, host, port);
      const url = `http://${host}:${actualPort}`;
      const queueTimer = startQueueScheduler();
      return {
        server,
        url,
        close: async () => {
          clearInterval(queueTimer);
          await closeManualVerifySessions();
          await new Promise<void>((resolve, reject) => {
            server.close((err) => (err !== undefined ? reject(err) : resolve()));
          });
        },
      };
    } catch (err) {
      if (!isRetryableListenError(err)) throw err;
      const code = (err as NodeJS.ErrnoException).code ?? 'unknown';
      process.stderr.write(
        `[signal-fire] local UI port ${formatPortCandidate(port)} unavailable (${code}); trying another port\n`,
      );
    }
  }

  throw new Error(`Could not find an open port starting at ${preferredPort}`);
}
