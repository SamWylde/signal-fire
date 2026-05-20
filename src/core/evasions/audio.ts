import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const SEED = ${fp.audioNoiseSeed >>> 0};
    function xorshift(s){ s = s>>>0 || 1; s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s >>> 0; }
    const native = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = __sfMaskNative(new Proxy(native, {
      apply(target, thisArg, args) {
        const data = Reflect.apply(target, thisArg, args);
        let s = SEED + (args[0] || 0);
        for (let i = 0; i < data.length; i++) {
          s = xorshift(s);
          data[i] += ((s / 0x100000000) - 0.5) * 1e-7;
        }
        return data;
      }
    }), native);
  `);
}
