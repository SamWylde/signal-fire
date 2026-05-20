import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearSession,
  getSessionPaths,
  hasPersistentProfile,
  isSessionFresh,
  loadSessionOverrides,
  markUserDataDirValidated,
  migrateProfileDirIfNeeded,
  readMetadata,
  saveStorageState,
  writeMetadata,
} from '../src/core/session.js';

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('markUserDataDirValidated', () => {
  it('switches existing storageState metadata to userDataDir mode', async () => {
    await writeMetadata({
      platform: 'linkedin',
      accountId: 'profile-user',
      mode: 'storageState',
      lastValidated: '2026-05-15T00:00:00.000Z',
    });

    const paths = getSessionPaths('linkedin', 'profile-user');
    await fsp.mkdir(paths.userDataDir, { recursive: true });

    await markUserDataDirValidated('linkedin', 'profile-user');

    const meta = await readMetadata('linkedin', 'profile-user');
    expect(meta?.mode).toBe('userDataDir');

    const overrides = await loadSessionOverrides('linkedin', 'profile-user');
    expect(overrides).toEqual({ userDataDir: paths.userDataDir });
  });
});

describe('getSessionPaths', () => {
  it('returns paths rooted at SIGNAL_FIRE_HOME', () => {
    const paths = getSessionPaths('tiktok', 'myAccount');
    expect(paths.storageStatePath).toContain('sessions');
    expect(paths.storageStatePath).toContain('tiktok');
    expect(paths.storageStatePath).toContain('myAccount.json');
    expect(paths.metadataPath).toContain('myAccount.meta.json');
    expect(paths.userDataDir).toContain('profiles');
  });

  it('sanitizes unsafe characters in accountId', () => {
    const paths = getSessionPaths('instagram', 'weird/name@host');
    expect(paths.storageStatePath).toContain('weird_name@host.json');
    expect(paths.metadataPath).toContain('weird_name@host.meta.json');
    expect(paths.userDataDir).toContain('weird_name@host');
  });

  it('preserves allowed characters: A-Z a-z 0-9 _ . -', () => {
    const paths = getSessionPaths('x', 'user_name.42-ok');
    expect(paths.storageStatePath).toContain('user_name.42-ok.json');
  });

  it('keeps labels with spaces distinct from compact labels', () => {
    const spaced = getSessionPaths('facebook', 'Thomas Darby');
    const compact = getSessionPaths('facebook', 'ThomasDarby');

    expect(spaced).not.toEqual(compact);
    expect(spaced.userDataDir).toContain('Thomas Darby');
  });
});

describe('writeMetadata + readMetadata', () => {
  it('roundtrips metadata', async () => {
    const meta = {
      platform: 'tiktok' as const,
      accountId: 'testUser',
      mode: 'storageState' as const,
      lastValidated: '2026-05-15T00:00:00.000Z',
    };
    await writeMetadata(meta);
    const read = await readMetadata('tiktok', 'testUser');
    expect(read).toEqual(meta);
  });

  it('returns null when metadata file does not exist', async () => {
    const result = await readMetadata('linkedin', 'nobody');
    expect(result).toBeNull();
  });

  it('creates parent directories as needed', async () => {
    const meta = {
      platform: 'youtube' as const,
      accountId: 'creator123',
      mode: 'userDataDir' as const,
      lastValidated: new Date().toISOString(),
    };
    await writeMetadata(meta);
    const paths = getSessionPaths('youtube', 'creator123');
    const stat = await fsp.stat(paths.metadataPath);
    expect(stat.isFile()).toBe(true);
  });
});

describe('isSessionFresh', () => {
  it('returns false when no metadata exists', async () => {
    const fresh = await isSessionFresh('reddit', 'ghost');
    expect(fresh).toBe(false);
  });

  it('returns true when storageState metadata matches the saved session file', async () => {
    const context = {
      storageState: async () => ({ cookies: [], origins: [] }),
    } as Parameters<typeof saveStorageState>[0];

    await saveStorageState(context, 'reddit', 'newUser');

    const fresh = await isSessionFresh('reddit', 'newUser');
    const overrides = await loadSessionOverrides('reddit', 'newUser');
    expect(fresh).toBe(true);
    expect(overrides.storageStatePath).toBe(getSessionPaths('reddit', 'newUser').storageStatePath);
  });

  it('returns false when storageState metadata has no trusted file hash', async () => {
    await writeMetadata({
      platform: 'reddit',
      accountId: 'newUser',
      mode: 'storageState',
      lastValidated: new Date().toISOString(),
    });
    const fresh = await isSessionFresh('reddit', 'newUser');
    expect(fresh).toBe(false);
  });

  it('returns false when lastValidated is beyond maxAgeHours', async () => {
    const context = {
      storageState: async () => ({ cookies: [], origins: [] }),
    } as Parameters<typeof saveStorageState>[0];
    await saveStorageState(context, 'reddit', 'oldUser');
    const meta = await readMetadata('reddit', 'oldUser');
    if (meta === null) throw new Error('expected metadata to exist');
    const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await writeMetadata({
      ...meta,
      lastValidated: staleDate,
    });
    const fresh = await isSessionFresh('reddit', 'oldUser', 24);
    expect(fresh).toBe(false);
  });

  it('respects a custom maxAgeHours', async () => {
    const paths = getSessionPaths('threads', 'user1');
    await fsp.mkdir(paths.userDataDir, { recursive: true });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await writeMetadata({
      platform: 'threads',
      accountId: 'user1',
      mode: 'userDataDir',
      lastValidated: twoHoursAgo,
    });
    expect(await isSessionFresh('threads', 'user1', 1)).toBe(false);
    expect(await isSessionFresh('threads', 'user1', 3)).toBe(true);
  });

  it('does not trust storageState if the file changed after metadata was written', async () => {
    const context = {
      storageState: async () => ({
        cookies: [{ name: 'a', value: '1', domain: '.x.com', path: '/' }],
        origins: [],
      }),
    } as Parameters<typeof saveStorageState>[0];

    await saveStorageState(context, 'x', 'mutated');
    const paths = getSessionPaths('x', 'mutated');
    await fsp.writeFile(paths.storageStatePath, '{"cookies":[],"origins":[]}', 'utf8');

    await expect(isSessionFresh('x', 'mutated')).resolves.toBe(false);
    await expect(loadSessionOverrides('x', 'mutated')).resolves.toEqual({});
  });
});

describe('clearSession', () => {
  it('is a no-op when nothing exists', async () => {
    await expect(clearSession('pinterest', 'nobody')).resolves.not.toThrow();
  });

  it('removes metadata and storageState files', async () => {
    const meta = {
      platform: 'facebook' as const,
      accountId: 'bob',
      mode: 'storageState' as const,
      lastValidated: new Date().toISOString(),
    };
    await writeMetadata(meta);
    const paths = getSessionPaths('facebook', 'bob');
    // also create a fake storageState file
    await fsp.mkdir(path.dirname(paths.storageStatePath), { recursive: true });
    await fsp.writeFile(paths.storageStatePath, '{}', 'utf8');

    await clearSession('facebook', 'bob');

    await expect(fsp.access(paths.metadataPath)).rejects.toThrow();
    await expect(fsp.access(paths.storageStatePath)).rejects.toThrow();
  });

  it('does not delete the shared persistent browser profile', async () => {
    const paths = getSessionPaths('facebook', 'bob');
    await fsp.mkdir(paths.userDataDir, { recursive: true });

    await clearSession('facebook', 'bob');

    await expect(fsp.access(paths.userDataDir)).resolves.toBeUndefined();
  });
});

describe('shared userDataDir across platforms', () => {
  it('userDataDir is shared across platforms for same accountId', () => {
    const fbPaths = getSessionPaths('facebook', 'alice');
    const igPaths = getSessionPaths('instagram', 'alice');
    expect(fbPaths.userDataDir).toBe(igPaths.userDataDir);
  });

  it('userDataDir does not contain the platform name', () => {
    const paths = getSessionPaths('facebook', 'alice');
    expect(paths.userDataDir).not.toContain('facebook');
    expect(paths.userDataDir).toContain('alice');
  });

  it('storageStatePath and metadataPath remain per-platform', () => {
    const fbPaths = getSessionPaths('facebook', 'alice');
    const igPaths = getSessionPaths('instagram', 'alice');
    expect(fbPaths.storageStatePath).not.toBe(igPaths.storageStatePath);
    expect(fbPaths.metadataPath).not.toBe(igPaths.metadataPath);
    expect(fbPaths.storageStatePath).toContain('facebook');
    expect(igPaths.storageStatePath).toContain('instagram');
  });
});

describe('migrateProfileDirIfNeeded', () => {
  it('moves a single old per-platform profile to the new shared path', async () => {
    const oldDir = path.join(tmpDir, 'profiles', 'facebook', 'alice');
    await fsp.mkdir(oldDir, { recursive: true });
    await fsp.writeFile(path.join(oldDir, 'marker.txt'), 'data', 'utf8');

    await migrateProfileDirIfNeeded('facebook', 'alice');

    const newDir = path.join(tmpDir, 'profiles', 'alice');
    const marker = await fsp.readFile(path.join(newDir, 'marker.txt'), 'utf8');
    expect(marker).toBe('data');
    await expect(fsp.access(oldDir)).rejects.toThrow();
  });

  it('recovers legacy underscore account profile dirs for labels with spaces', async () => {
    const oldDir = path.join(tmpDir, 'profiles', 'facebook', 'Thomas_Darby');
    await fsp.mkdir(oldDir, { recursive: true });
    await fsp.writeFile(path.join(oldDir, 'marker.txt'), 'facebook-login', 'utf8');

    await expect(hasPersistentProfile('facebook', 'Thomas Darby')).resolves.toBe(true);
    await migrateProfileDirIfNeeded('facebook', 'Thomas Darby');

    const newDir = path.join(tmpDir, 'profiles', 'Thomas Darby');
    const marker = await fsp.readFile(path.join(newDir, 'marker.txt'), 'utf8');
    expect(marker).toBe('facebook-login');
    await expect(fsp.access(oldDir)).rejects.toThrow();
  });

  it('is idempotent when the new shared path already exists', async () => {
    const newDir = path.join(tmpDir, 'profiles', 'alice');
    await fsp.mkdir(newDir, { recursive: true });
    await fsp.writeFile(path.join(newDir, 'existing.txt'), 'existing', 'utf8');

    // Old path also exists — migration should be skipped
    const oldDir = path.join(tmpDir, 'profiles', 'facebook', 'alice');
    await fsp.mkdir(oldDir, { recursive: true });
    await fsp.writeFile(path.join(oldDir, 'old.txt'), 'old', 'utf8');

    await migrateProfileDirIfNeeded('facebook', 'alice');

    // New path unchanged
    const existing = await fsp.readFile(path.join(newDir, 'existing.txt'), 'utf8');
    expect(existing).toBe('existing');
    // Old path still there (not touched)
    const oldExists = await fsp
      .access(oldDir)
      .then(() => true)
      .catch(() => false);
    expect(oldExists).toBe(true);
  });

  it('picks the most recently modified profile when multiple old per-platform dirs exist', async () => {
    // Create facebook profile (older)
    const fbDir = path.join(tmpDir, 'profiles', 'facebook', 'alice');
    await fsp.mkdir(fbDir, { recursive: true });
    await fsp.writeFile(path.join(fbDir, 'fb.txt'), 'facebook-data', 'utf8');

    // Wait a tick then create instagram profile (newer)
    await new Promise((resolve) => setTimeout(resolve, 20));
    const igDir = path.join(tmpDir, 'profiles', 'instagram', 'alice');
    await fsp.mkdir(igDir, { recursive: true });
    await fsp.writeFile(path.join(igDir, 'ig.txt'), 'instagram-data', 'utf8');

    await migrateProfileDirIfNeeded('facebook', 'alice');

    const newDir = path.join(tmpDir, 'profiles', 'alice');

    // The newer instagram profile should be at the new shared path
    const igFile = await fsp.readFile(path.join(newDir, 'ig.txt'), 'utf8');
    expect(igFile).toBe('instagram-data');

    // The older facebook profile should be archived to profiles-legacy/
    const legacyDir = path.join(tmpDir, 'profiles-legacy', 'facebook-alice');
    const fbFile = await fsp.readFile(path.join(legacyDir, 'fb.txt'), 'utf8');
    expect(fbFile).toBe('facebook-data');

    // Original dirs are gone
    await expect(fsp.access(fbDir)).rejects.toThrow();
    await expect(fsp.access(igDir)).rejects.toThrow();
  });
});
