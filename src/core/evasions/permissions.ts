import type { AccountFingerprint } from '../fingerprint.js';
import { toStringMaskingPrelude, wrap } from './utils.js';

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    const promptPermissions = new Set([
      'camera',
      'clipboard-read',
      'clipboard-write',
      'geolocation',
      'microphone',
      'midi',
      'midi-sysex',
      'notifications'
    ]);
    const normalizeState = (state) => (state === 'default' ? 'prompt' : state);
    if (typeof Notification !== 'undefined') {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true
      });
    }
    if (navigator.permissions && navigator.permissions.query) {
      const native = navigator.permissions.query.bind(navigator.permissions);
      const query = function(permissionDesc) {
        const name = permissionDesc && permissionDesc.name;
        if (promptPermissions.has(name)) {
          const permission =
            name === 'notifications' && typeof Notification !== 'undefined'
              ? Notification.permission
              : 'default';
          const state = normalizeState(permission);
          return Promise.resolve({ state, onchange: null });
        }
        return native(permissionDesc);
      };
      navigator.permissions.query = __sfMaskNative(query, native);
    }
  `);
}
