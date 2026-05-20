import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  `);
}
