import type { Dirent } from 'node:fs';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Returns the signal-fire home directory.
 * Respects SIGNAL_FIRE_HOME env override for tests.
 */
export function getSignalFireHome(): string {
  return process.env.SIGNAL_FIRE_HOME ?? path.join(os.homedir(), '.signal-fire');
}

/**
 * Canonical account-ID sanitizer.
 *
 * Rules:
 *  - Normalize Unicode to NFKC
 *  - Strip characters that are forbidden in Windows filenames: \ / : * ? " < > | and control chars
 *  - Collapse runs of whitespace to a single space
 *  - Trim leading/trailing whitespace
 *  - Fall back to 'main' for an empty result
 *
 * Spaces are ALLOWED — Windows filesystems handle them fine.
 * We do NOT encodeURIComponent so "Thomas Darby" stays "Thomas Darby" on disk.
 */
export function sanitizeAccountId(id: string): string {
  return (
    id
      .normalize('NFKC')
      // forbidden Windows path chars
      .replace(/[/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'main'
  );
}

/**
 * Historical account IDs were sometimes stored as URL-encoded, compact,
 * underscore, or kebab-case path names. Keep these variants available for
 * recovery/migration, while using sanitizeAccountId as the canonical target.
 */
export function legacyAccountIdVariants(id: string): string[] {
  const canonical = sanitizeAccountId(id);
  const variants = new Set<string>();

  variants.add(canonical);
  variants.add(encodeURIComponent(canonical));
  variants.add(canonical.replace(/\s+/g, ''));
  variants.add(canonical.replace(/\s+/g, '_'));
  variants.add(canonical.replace(/\s+/g, '-'));
  variants.delete('');

  return [...variants];
}

/**
 * One-time migration: rename any URL-encoded account-ID paths to their decoded equivalents.
 *
 * Scans fingerprints/, profiles/, sessions/<platform>/, credentials/<platform>/, blocks/<platform>/,
 * and ledger/<platform>/ for entries whose names contain '%'.
 *
 * For each such entry:
 *   - If the decoded target doesn't exist yet: rename in place.
 *   - If both exist: keep the OLDER one (it has real data) and archive the newer one to
 *     ~/.signal-fire/legacy-encoded/<dir>-<name>.
 *
 * Uses a marker file to run at most once.
 */
export async function migrateLegacyAccountIds(): Promise<void> {
  const root = getSignalFireHome();
  const markerPath = path.join(root, 'legacy-id-migration-done');

  if (fsSync.existsSync(markerPath)) return;

  // Top-level flat dirs (entries are files, not nested under platform)
  const flatDirs = ['fingerprints', 'profiles'];

  // Dirs that contain per-platform subdirectories
  const platformDirs = ['sessions', 'credentials', 'blocks', 'ledger'];

  const allDirsToScan: string[] = [];

  for (const dir of flatDirs) {
    allDirsToScan.push(path.join(root, dir));
  }

  for (const dir of platformDirs) {
    const base = path.join(root, dir);
    if (!fsSync.existsSync(base)) continue;
    try {
      const platforms = await fs.readdir(base);
      for (const plat of platforms) {
        allDirsToScan.push(path.join(base, plat));
      }
    } catch {
      // skip unreadable dirs
    }
  }

  for (const dirPath of allDirsToScan) {
    if (!fsSync.existsSync(dirPath)) continue;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (!name.includes('%')) continue;

      // Decode the name, preserving the extension suffix
      let baseName = name;
      let suffix = '';
      if (name.endsWith('.meta.json')) {
        baseName = name.slice(0, -'.meta.json'.length);
        suffix = '.meta.json';
      } else if (name.endsWith('.json')) {
        baseName = name.slice(0, -'.json'.length);
        suffix = '.json';
      }

      let decoded: string;
      try {
        decoded = decodeURIComponent(baseName);
      } catch {
        // malformed percent-encoding — skip
        continue;
      }

      // Apply the canonical sanitizer so the result is clean
      const canonical = sanitizeAccountId(decoded);
      const decodedName = canonical + suffix;

      if (decodedName === name) continue; // already canonical

      const oldPath = path.join(dirPath, name);
      const newPath = path.join(dirPath, decodedName);

      if (!fsSync.existsSync(newPath)) {
        // Simple case: decoded path doesn't exist yet
        await fs.rename(oldPath, newPath);
        process.stderr.write(`[migrate] ${dirPath}/${name} → ${decodedName}\n`);
      } else {
        // Both exist — keep the older one (real data), archive the newer one
        const [oldStat, newStat] = await Promise.all([fs.stat(oldPath), fs.stat(newPath)]);
        const relDir = path.relative(root, dirPath).replace(/\\/g, '/');

        if (oldStat.mtimeMs <= newStat.mtimeMs) {
          // The encoded (old) entry is OLDER or same age — it has real data.
          // Archive the decoded (newer/empty) one, then rename encoded to decoded.
          const archivePath = path.join(root, 'legacy-encoded', `${relDir}-${decodedName}.empty`);
          await fs.mkdir(path.dirname(archivePath), { recursive: true });
          await fs.rename(newPath, archivePath);
          await fs.rename(oldPath, newPath);
          process.stderr.write(
            `[migrate] swapped ${relDir}/${name} ↔ ${decodedName} (encoded had real data)\n`,
          );
        } else {
          // The decoded entry is OLDER — it has real data. Archive the encoded (fresh/empty) one.
          const archivePath = path.join(root, 'legacy-encoded', `${relDir}-${name}`);
          await fs.mkdir(path.dirname(archivePath), { recursive: true });
          await fs.rename(oldPath, archivePath);
          process.stderr.write(
            `[migrate] archived fresh encoded ${relDir}/${name} (decoded has real data)\n`,
          );
        }
      }
    }
  }

  // Write marker so this never runs again
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(markerPath, new Date().toISOString(), 'utf8');
}
