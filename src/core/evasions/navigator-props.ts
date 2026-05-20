import type { AccountFingerprint } from '../fingerprint.js';
import { json, toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const props = {
      platform: ${json(fp.platform)},
      vendor: ${json(fp.vendor)},
      hardwareConcurrency: ${fp.hardwareConcurrency},
      deviceMemory: ${fp.deviceMemory},
      maxTouchPoints: 0
    };
    for (const [key, value] of Object.entries(props)) {
      const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, key);
      const nativeGetter = descriptor && descriptor.get ? descriptor.get : function get() {};
      const getter = __sfMaskNative(new Proxy(nativeGetter, {
        apply() {
          return value;
        }
      }), nativeGetter);
      Object.defineProperty(Navigator.prototype, key, {
        get: getter,
        configurable: true
      });
    }
  `);
}
