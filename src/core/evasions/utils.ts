import type { AccountFingerprint } from '../fingerprint.js';

export type EvasionBuilder = (fp: AccountFingerprint) => string;

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export function wrap(body: string): string {
  return `(() => { try { ${body} } catch {} })();`;
}

export function toStringMaskingPrelude(): string {
  return `
    const __sfFunctionProto = Function.prototype;
    const __sfOriginalToString =
      __sfFunctionProto.__signalFireOriginalFunctionToString || Function.prototype.toString;
    const __sfToStringMap = __sfFunctionProto.__signalFireToStringMap || new WeakMap();
    try {
      Object.defineProperty(__sfFunctionProto, '__signalFireOriginalFunctionToString', {
        value: __sfOriginalToString,
        configurable: false
      });
      Object.defineProperty(__sfFunctionProto, '__signalFireToStringMap', {
        value: __sfToStringMap,
        configurable: false
      });
    } catch {}
    if (!Function.prototype.toString.__signalFirePatched) {
      const __sfPatchedToString = new Proxy(__sfOriginalToString, {
        apply(target, thisArg, args) {
          if (__sfToStringMap.has(thisArg)) return __sfToStringMap.get(thisArg);
          return Reflect.apply(target, thisArg, args);
        }
      });
      __sfToStringMap.set(__sfPatchedToString, 'function toString() { [native code] }');
      Object.defineProperty(__sfPatchedToString, '__signalFirePatched', { value: true });
      Object.defineProperty(Function.prototype, 'toString', {
        value: __sfPatchedToString,
        configurable: true,
        writable: true
      });
    }
    function __sfMaskNative(fn, nativeFn) {
      try {
        __sfToStringMap.set(fn, __sfOriginalToString.call(nativeFn));
      } catch {
        const name = nativeFn && nativeFn.name ? nativeFn.name : '';
        __sfToStringMap.set(fn, 'function ' + name + '() { [native code] }');
      }
      return fn;
    }
    function __sfMaskNativeString(fn, name) {
      __sfToStringMap.set(fn, 'function ' + name + '() { [native code] }');
      return fn;
    }
  `;
}
