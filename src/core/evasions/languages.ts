import type { AccountFingerprint } from '../fingerprint.js';
import { json, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    const languages = Object.freeze(${json(fp.languages)}.slice());
    Object.defineProperty(Navigator.prototype, 'languages', { get: () => languages, configurable: true });
    Object.defineProperty(Navigator.prototype, 'language', { get: () => languages[0], configurable: true });
  `);
}
