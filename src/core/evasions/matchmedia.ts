import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  const prefersDark = (fp.canvasNoiseSeed & 1) === 1;

  return wrap(`
    ${toStringMaskingPrelude()}
    const nativeMatchMedia = window.matchMedia
      ? window.matchMedia
      : function matchMedia(query) {
          return {
            matches: false,
            media: String(query),
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return true; }
          };
        };
    const table = new Map([
      ['(hover: hover)', true],
      ['(hover: none)', false],
      ['(pointer: fine)', true],
      ['(pointer: coarse)', false],
      ['(any-pointer: fine)', true],
      ['(any-pointer: coarse)', false],
      ['(prefers-reduced-motion: reduce)', false],
      ['(prefers-contrast: more)', false],
      ['(prefers-color-scheme: dark)', ${prefersDark}],
      ['(prefers-color-scheme: light)', ${!prefersDark}],
      ['(prefers-reduced-transparency: reduce)', false],
      ['(forced-colors: active)', false],
      ['(prefers-reduced-data: reduce)', false]
    ]);
    function mediaList(query, matches) {
      return {
        matches,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; }
      };
    }
    const matchMedia = __sfMaskNative(new Proxy(nativeMatchMedia, {
      apply(target, thisArg, args) {
        const query = args[0];
        const normalized = String(query).trim().toLowerCase();
        if (table.has(normalized)) return mediaList(String(query), table.get(normalized));
        return Reflect.apply(target, window, args);
      }
    }), window.matchMedia || function matchMedia() {});
    Object.defineProperty(window, 'matchMedia', {
      value: matchMedia,
      configurable: true,
      writable: true
    });
  `);
}
