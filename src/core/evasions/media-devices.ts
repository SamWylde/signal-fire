import type { AccountFingerprint } from '../fingerprint.js';
import { json, toStringMaskingPrelude, wrap } from './utils.js';

function deviceId(fp: AccountFingerprint, kind: string): string {
  return `${kind}-${fp.canvasNoiseSeed.toString(16).padStart(8, '0')}`;
}

export function buildScript(fp: AccountFingerprint): string {
  const devices = [
    { deviceId: 'default', groupId: '', kind: 'audioinput', label: '' },
    { deviceId: deviceId(fp, 'camera'), groupId: '', kind: 'videoinput', label: '' },
    { deviceId: 'default', groupId: '', kind: 'audiooutput', label: '' },
  ];

  return wrap(`
    ${toStringMaskingPrelude()}
    const devices = ${json(devices)};
    const makeDevice = (device) => {
      const record = {
        deviceId: device.deviceId,
        groupId: device.groupId,
        kind: device.kind,
        label: device.label,
        toJSON() {
          return {
            deviceId: this.deviceId,
            groupId: this.groupId,
            kind: this.kind,
            label: this.label
          };
        }
      };
      try {
        if (typeof MediaDeviceInfo !== 'undefined' && MediaDeviceInfo.prototype) {
          Object.setPrototypeOf(record, MediaDeviceInfo.prototype);
        }
      } catch {}
      return Object.freeze(record);
    };
    const mediaDevices =
      navigator.mediaDevices ||
      Object.create(typeof EventTarget !== 'undefined' ? EventTarget.prototype : Object.prototype);
    const native =
      mediaDevices.enumerateDevices ||
      function enumerateDevices() {
        return Promise.resolve([]);
      };
    const enumerateDevices = __sfMaskNative(new Proxy(native, {
      apply() {
        return Promise.resolve(devices.map(makeDevice));
      }
    }), native);
    Object.defineProperty(mediaDevices, 'enumerateDevices', {
      value: enumerateDevices,
      configurable: true
    });
    if (!navigator.mediaDevices) {
      Object.defineProperty(Navigator.prototype, 'mediaDevices', {
        get: () => mediaDevices,
        configurable: true
      });
    }
  `);
}
