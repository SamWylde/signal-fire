import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (descriptor && descriptor.get) {
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: function() {
          const win = descriptor.get.call(this);
          if (!win || !this.srcdoc) return win;
          return new Proxy(win, {
            get(target, key) {
              if (key === 'self' || key === 'window') return target;
              if (key === 'frameElement') return this;
              return Reflect.get(target, key);
            }
          });
        },
        configurable: true
      });
    }
  `);
}
