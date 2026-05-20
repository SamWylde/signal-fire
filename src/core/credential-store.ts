import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { getSignalFireHome, sanitizeAccountId } from './account-id.js';
import { uniqueTempPath, withFileLock } from './file-lock.js';
import type { AccountId, Platform } from './types.js';

export interface StoredCredentials {
  platform: Platform;
  accountId: AccountId;
  identity: string;
  password: string;
  updatedAt: string;
}

interface CredentialRecord {
  version: 1;
  platform: Platform;
  accountId: AccountId;
  identity: string;
  passwordCiphertext: string;
  passwordIv: string;
  passwordTag: string;
  updatedAt: string;
}

function credentialKey(): Buffer {
  const material =
    process.env.SIGNAL_FIRE_CREDENTIAL_KEY ??
    `signal-fire-local-credential-store|${os.userInfo().username}|${os.hostname()}`;
  return createHash('sha256').update(material).digest();
}

function encryptPassword(
  password: string,
): Pick<CredentialRecord, 'passwordCiphertext' | 'passwordIv' | 'passwordTag'> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return {
    passwordCiphertext: ciphertext.toString('base64'),
    passwordIv: iv.toString('base64'),
    passwordTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptPassword(record: CredentialRecord): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    credentialKey(),
    Buffer.from(record.passwordIv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.passwordTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.passwordCiphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function credentialsPath(platform: Platform, accountId: AccountId): string {
  return path.join(
    getSignalFireHome(),
    'credentials',
    platform,
    `${sanitizeAccountId(accountId)}.json`,
  );
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const tmpPath = uniqueTempPath(filePath);
  let handle: fs.FileHandle | undefined;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    handle = await fs.open(tmpPath, 'wx');
    await handle.writeFile(JSON.stringify(data, null, 2), 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    if (handle !== undefined) await handle.close().catch(() => undefined);
    await fs.rm(tmpPath, { force: true }).catch(() => undefined);
    throw err;
  }
}

export async function readStoredCredentials(
  platform: Platform,
  accountId: AccountId,
): Promise<StoredCredentials | null> {
  try {
    const record = JSON.parse(
      await fs.readFile(credentialsPath(platform, accountId), 'utf8'),
    ) as CredentialRecord;
    return {
      platform: record.platform,
      accountId: record.accountId,
      identity: record.identity,
      password: decryptPassword(record),
      updatedAt: record.updatedAt,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function writeStoredCredentials(input: {
  platform: Platform;
  accountId: AccountId;
  identity: string;
  password: string;
}): Promise<StoredCredentials> {
  const identity = input.identity.trim();
  if (identity.length === 0) throw new Error('Email or username is required');
  if (input.password.length === 0) throw new Error('Password is required');

  const filePath = credentialsPath(input.platform, input.accountId);
  const updatedAt = new Date().toISOString();
  const record: CredentialRecord = {
    version: 1,
    platform: input.platform,
    accountId: input.accountId,
    identity,
    ...encryptPassword(input.password),
    updatedAt,
  };

  await withFileLock(`${filePath}.lock`, async () => {
    await atomicWriteJson(filePath, record);
  });

  return {
    platform: input.platform,
    accountId: input.accountId,
    identity,
    password: input.password,
    updatedAt,
  };
}

export async function clearStoredCredentials(
  platform: Platform,
  accountId: AccountId,
): Promise<void> {
  await fs.rm(credentialsPath(platform, accountId), { force: true });
}
