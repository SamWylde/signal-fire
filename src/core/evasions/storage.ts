import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(fp: AccountFingerprint): string {
  const quota = 12_000_000_000_000;
  const usageFraction = 0.05 + ((fp.canvasNoiseSeed % 1000) / 1000) * 0.15;
  const usage = Math.floor(quota * usageFraction);

  return wrap(`
    ${toStringMaskingPrelude()}
    if (navigator.storage) {
      const nativeEstimate =
        navigator.storage.estimate ||
        function estimate() {
          return Promise.resolve({});
        };
      const estimate = __sfMaskNative(new Proxy(nativeEstimate, {
        apply() {
          return Promise.resolve({
            quota: ${quota},
            usage: ${usage},
            usageDetails: {}
          });
        }
      }), nativeEstimate);
      Object.defineProperty(navigator.storage, 'estimate', {
        value: estimate,
        configurable: true,
        writable: true
      });
    }
  `);
}
