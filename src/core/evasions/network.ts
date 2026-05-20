import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

function pick<T>(items: readonly T[], seed: number): T {
  const item = items[(seed >>> 0) % items.length];
  if (item === undefined) throw new Error('Cannot pick from an empty network profile pool');
  return item;
}

export function buildScript(fp: AccountFingerprint): string {
  const seed = (fp.audioNoiseSeed ^ fp.canvasNoiseSeed) >>> 0;
  const rtt = pick([50, 75, 100, 125], seed);
  const downlink = pick([7.5, 10, 12.5, 15, 20], seed >>> 3);

  return wrap(`
    const profile = {
      effectiveType: '4g',
      rtt: ${rtt},
      downlink: ${downlink},
      saveData: false,
      type: 'wifi'
    };
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      Object.create(typeof EventTarget !== 'undefined' ? EventTarget.prototype : Object.prototype);
    for (const [key, value] of Object.entries(profile)) {
      try {
        Object.defineProperty(connection, key, {
          get: () => value,
          configurable: true
        });
      } catch {}
    }
    if (!('onchange' in connection)) {
      try {
        Object.defineProperty(connection, 'onchange', {
          value: null,
          writable: true,
          configurable: true
        });
      } catch {}
    }
    if (!connection.addEventListener) {
      Object.defineProperty(connection, 'addEventListener', {
        value: function addEventListener() {},
        configurable: true
      });
      Object.defineProperty(connection, 'removeEventListener', {
        value: function removeEventListener() {},
        configurable: true
      });
      Object.defineProperty(connection, 'dispatchEvent', {
        value: function dispatchEvent() { return true; },
        configurable: true
      });
    }
    for (const key of ['connection', 'mozConnection', 'webkitConnection']) {
      try {
        Object.defineProperty(Navigator.prototype, key, {
          get: () => connection,
          configurable: true
        });
      } catch {}
    }
  `);
}
