import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  const level = 0.85 + ((fp.canvasNoiseSeed % 1500) / 1500) * 0.15;

  return wrap(`
    ${toStringMaskingPrelude()}
    const battery = Object.freeze({
      charging: true,
      chargingTime: Infinity,
      dischargingTime: Infinity,
      level: ${level.toFixed(4)},
      onchargingchange: null,
      onchargingtimechange: null,
      ondischargingtimechange: null,
      onlevelchange: null,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() { return true; }
    });
    const native = navigator.getBattery || Promise.resolve;
    const getBattery = __sfMaskNative(new Proxy(native, {
      apply() {
        return Promise.resolve(battery);
      }
    }), native);
    Object.defineProperty(Navigator.prototype, 'getBattery', {
      value: getBattery,
      configurable: true,
      writable: true
    });
  `);
}
