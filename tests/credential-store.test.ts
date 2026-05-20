import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearStoredCredentials,
  credentialsPath,
  readStoredCredentials,
  writeStoredCredentials,
} from '../src/core/credential-store.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;
const originalKey = process.env.SIGNAL_FIRE_CREDENTIAL_KEY;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-credentials-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
  process.env.SIGNAL_FIRE_CREDENTIAL_KEY = 'test-only-key';
});

afterEach(async () => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  if (originalKey === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_CREDENTIAL_KEY');
  } else {
    process.env.SIGNAL_FIRE_CREDENTIAL_KEY = originalKey;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('credential store', () => {
  it('persists and reloads credentials per platform/account', async () => {
    await writeStoredCredentials({
      platform: 'facebook',
      accountId: 'main',
      identity: 'person@example.com',
      password: 'correct horse battery staple',
    });

    await expect(readStoredCredentials('facebook', 'main')).resolves.toMatchObject({
      platform: 'facebook',
      accountId: 'main',
      identity: 'person@example.com',
      password: 'correct horse battery staple',
    });
  });

  it('does not write the raw password into the credential file', async () => {
    await writeStoredCredentials({
      platform: 'instagram',
      accountId: 'creator',
      identity: 'person@example.com',
      password: 'do-not-store-raw',
    });

    const raw = await fs.readFile(credentialsPath('instagram', 'creator'), 'utf8');
    expect(raw).not.toContain('do-not-store-raw');
    expect(raw).toContain('passwordCiphertext');
  });

  it('can clear stored credentials', async () => {
    await writeStoredCredentials({
      platform: 'x',
      accountId: 'main',
      identity: 'person@example.com',
      password: 'secret',
    });

    await clearStoredCredentials('x', 'main');

    await expect(readStoredCredentials('x', 'main')).resolves.toBeNull();
  });

  it('keeps labels with spaces distinct from compact labels', () => {
    expect(credentialsPath('facebook', 'Thomas Darby')).not.toBe(
      credentialsPath('facebook', 'ThomasDarby'),
    );
    expect(credentialsPath('facebook', 'Thomas Darby')).toContain('Thomas Darby');
  });

  it('loads legacy compact credential files for labels with spaces', async () => {
    await writeStoredCredentials({
      platform: 'facebook',
      accountId: 'ThomasDarby',
      identity: 'person@example.com',
      password: 'saved-password',
    });

    await expect(readStoredCredentials('facebook', 'Thomas Darby')).resolves.toMatchObject({
      platform: 'facebook',
      identity: 'person@example.com',
      password: 'saved-password',
    });
  });

  it('clears legacy credential variants for labels with spaces', async () => {
    await writeStoredCredentials({
      platform: 'facebook',
      accountId: 'ThomasDarby',
      identity: 'person@example.com',
      password: 'saved-password',
    });

    await clearStoredCredentials('facebook', 'Thomas Darby');

    await expect(readStoredCredentials('facebook', 'Thomas Darby')).resolves.toBeNull();
    await expect(readStoredCredentials('facebook', 'ThomasDarby')).resolves.toBeNull();
  });
});
