import type { AccountFingerprint } from '../fingerprint.js';
import { wrap } from './utils.js';

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    const plugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }
    ];
    const mimeTypes = [
      { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ];
    function makeArray(items) {
      const arr = items.slice();
      arr.item = (i) => arr[i] || null;
      arr.namedItem = (name) => arr.find((item) => item.name === name || item.type === name) || null;
      return arr;
    }
    Object.defineProperty(Navigator.prototype, 'plugins', { get: () => makeArray(plugins), configurable: true });
    Object.defineProperty(Navigator.prototype, 'mimeTypes', { get: () => makeArray(mimeTypes), configurable: true });
  `);
}
