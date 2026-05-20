import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'webdriver');
    const nativeGetter = descriptor && descriptor.get ? descriptor.get : function webdriver() {};
    const getter = __sfMaskNative(new Proxy(nativeGetter, {
      apply() {
        return undefined;
      }
    }), nativeGetter);
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: getter,
      configurable: true
    });
  `);
}
