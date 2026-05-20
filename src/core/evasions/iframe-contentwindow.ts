import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    if (descriptor && descriptor.get) {
      const nativeGetter = descriptor.get;
      const getter = __sfMaskNative(new Proxy(nativeGetter, {
        apply(target, thisArg, args) {
          const win = Reflect.apply(target, thisArg, args);
          if (!win || !thisArg || !thisArg.srcdoc) return win;
          return new Proxy(win, {
            get(frameTarget, key) {
              if (key === 'self' || key === 'window') return frameTarget;
              if (key === 'frameElement') return thisArg;
              return Reflect.get(frameTarget, key);
            }
          });
        }
      }), nativeGetter);
      Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
        get: getter,
        configurable: true
      });
    }
  `);
}
