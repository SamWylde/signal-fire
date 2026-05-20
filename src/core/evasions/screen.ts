import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    const width = ${fp.screenWidth};
    const height = ${fp.screenHeight};
    const colorDepth = ${fp.colorDepth};
    const props = {
      width,
      height,
      availWidth: width,
      availHeight: Math.max(0, height - 40),
      colorDepth,
      pixelDepth: colorDepth
    };
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(Screen.prototype, key, {
        get: () => value,
        configurable: true
      });
    }
  `);
}
