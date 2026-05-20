import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    const native = HTMLMediaElement.prototype.canPlayType;
    const overrides = [
      ['video/mp4; codecs="avc1.42E01E"', 'probably'],
      ['video/mp4; codecs="avc1.64001F"', 'probably'],
      ['video/mp4; codecs="avc1.4D401E"', 'probably'],
      ['audio/mp4; codecs="mp4a.40.2"', 'probably'],
      ['audio/aac', 'probably'],
      ['video/webm; codecs="vp8, vorbis"', 'maybe'],
      ['video/webm; codecs="vp9"', 'maybe'],
      ['audio/webm; codecs="vorbis"', 'maybe'],
      ['audio/ogg; codecs="vorbis"', 'maybe']
    ];
    HTMLMediaElement.prototype.canPlayType = new Proxy(native, {
      apply(target, thisArg, args) {
        const value = Reflect.apply(target, thisArg, args);
        if (value) return value;
        const type = String(args[0] || '').toLowerCase();
        for (const [needle, result] of overrides) {
          if (type.includes(needle.toLowerCase())) return result;
        }
        return value;
      }
    });
  `);
}
