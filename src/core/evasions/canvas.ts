import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const SEED = ${fp.canvasNoiseSeed >>> 0};
    function xorshift(s){ s = s>>>0 || 1; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; }
    function clampByte(value) {
      return Math.max(0, Math.min(255, value));
    }
    function stabilizeChannel(value, delta) {
      if (value <= 0 || value >= 255) return value;
      const quantized = Math.round(value / 16) * 16;
      return clampByte(quantized + delta);
    }
    function addCanvasNoise(imageData){
      const d = imageData.data;
      let s = SEED;
      for (let i = 0; i < d.length; i += 4) {
        s = xorshift(s);
        const delta = (s & 1) ? 1 : -1;
        if (d[i + 3] === 0) continue;
        d[i] = stabilizeChannel(d[i], delta);
        d[i + 1] = stabilizeChannel(d[i + 1], -delta);
        d[i + 2] = stabilizeChannel(d[i + 2], delta);
      }
      return imageData;
    }
    const nativeGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = __sfMaskNative(new Proxy(nativeGetImageData, {
      apply(target, thisArg, args) {
        return addCanvasNoise(Reflect.apply(target, thisArg, args));
      }
    }), nativeGetImageData);
    function withNoisyCanvas(canvas, fn) {
      const ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx || !canvas.width || !canvas.height) return fn();
      const original = nativeGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
      const noisy = new ImageData(new Uint8ClampedArray(original.data), original.width, original.height);
      addCanvasNoise(noisy);
      ctx.putImageData(noisy, 0, 0);
      try { return fn(); }
      finally { ctx.putImageData(original, 0, 0); }
    }
    const nativeToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = __sfMaskNative(new Proxy(nativeToDataURL, {
      apply(target, thisArg, args) {
        return withNoisyCanvas(thisArg, () => Reflect.apply(target, thisArg, args));
      }
    }), nativeToDataURL);
    const nativeToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = __sfMaskNative(new Proxy(nativeToBlob, {
      apply(target, thisArg, args) {
        return withNoisyCanvas(thisArg, () => Reflect.apply(target, thisArg, args));
      }
    }), nativeToBlob);
  `);
}
