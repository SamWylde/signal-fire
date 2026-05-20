import type { AccountFingerprint } from '../fingerprint.js';
import { json, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    const fonts = new Set(${json(fp.fonts)});
    if (document.fonts && document.fonts.check) {
      const native = document.fonts.check.bind(document.fonts);
      document.fonts.check = function(query, text) {
        const q = String(query || '').toLowerCase();
        for (const font of fonts) {
          if (q.includes(font.toLowerCase())) return true;
        }
        return native(query, text);
      };
    }
  `);
}
