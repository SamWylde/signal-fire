import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const SEED = ${fp.canvasNoiseSeed >>> 0};
    function stableHash(value) {
      let h = 0;
      for (let i = 0; i < value.length; i += 1) {
        h = ((h << 5) - h + value.charCodeAt(i)) | 0;
      }
      return h >>> 0;
    }
    function xorshift(s) {
      s = s >>> 0 || 1;
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return s >>> 0;
    }
    function noiseFor(text, font) {
      const hash = stableHash(String(text) + '|' + String(font)) ^ SEED;
      return ((xorshift(hash) / 0x100000000) - 0.5) * 0.1;
    }
    const numericTextMetricFields = new Set([
      'width',
      'actualBoundingBoxLeft',
      'actualBoundingBoxRight',
      'fontBoundingBoxAscent',
      'fontBoundingBoxDescent',
      'actualBoundingBoxAscent',
      'actualBoundingBoxDescent',
      'emHeightAscent',
      'emHeightDescent',
      'hangingBaseline',
      'alphabeticBaseline',
      'ideographicBaseline'
    ]);
    const nativeMeasureText = CanvasRenderingContext2D.prototype.measureText;
    const measureText = __sfMaskNative(new Proxy(nativeMeasureText, {
      apply(target, thisArg, args) {
        const metrics = Reflect.apply(target, thisArg, args);
        const delta = noiseFor(args[0] || '', thisArg && thisArg.font ? thisArg.font : '');
        return new Proxy(metrics, {
          get(targetMetrics, prop) {
            const value = Reflect.get(targetMetrics, prop, targetMetrics);
            if (typeof value === 'number' && numericTextMetricFields.has(prop)) {
              return value + delta * (prop === 'width' ? 1 : 0.5);
            }
            return value;
          }
        });
      }
    }), nativeMeasureText);
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'measureText', {
      value: measureText,
      configurable: true
    });
  `);
}
