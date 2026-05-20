import type { AccountFingerprint } from '../fingerprint.js';
import { json, toStringMaskingPrelude, wrap } from './utils.js';

interface WebGpuProfile {
  architecture: string;
  description: string;
  vendor: string;
}

function profileForRenderer(renderer: string): WebGpuProfile {
  const lower = renderer.toLowerCase();
  if (lower.includes('nvidia')) {
    return { architecture: 'ampere', description: renderer, vendor: 'nvidia' };
  }
  if (lower.includes('amd') || lower.includes('radeon')) {
    return { architecture: 'rdna2', description: renderer, vendor: 'amd' };
  }
  if (lower.includes('apple')) {
    return { architecture: 'apple7', description: renderer, vendor: 'apple' };
  }
  if (lower.includes('swiftshader') || lower.includes('google')) {
    return { architecture: 'swiftshader', description: renderer, vendor: 'google' };
  }
  return { architecture: 'xe-lp', description: renderer, vendor: 'intel' };
}

export function buildScript(fp: AccountFingerprint): string {
  const profile = profileForRenderer(fp.webglRenderer);

  return wrap(`
    ${toStringMaskingPrelude()}
    const profile = ${json(profile)};
    if (navigator.gpu && navigator.gpu.requestAdapter) {
      const nativeRequestAdapter = navigator.gpu.requestAdapter;
      const requestAdapter = __sfMaskNative(new Proxy(nativeRequestAdapter, {
        async apply(target, thisArg, args) {
          const adapter = await Reflect.apply(target, navigator.gpu, args);
          if (!adapter || !adapter.requestAdapterInfo) return adapter;
          const nativeInfo = adapter.requestAdapterInfo;
          const requestAdapterInfo = __sfMaskNative(new Proxy(nativeInfo, {
            async apply(infoTarget, infoThisArg, infoArgs) {
              return {
                vendor: profile.vendor,
                architecture: profile.architecture,
                device: '',
                description: profile.description
              };
            }
          }), nativeInfo);
          try {
            Object.defineProperty(adapter, 'requestAdapterInfo', {
              value: requestAdapterInfo,
              configurable: true
            });
          } catch {}
          return adapter;
        }
      }), nativeRequestAdapter);
      Object.defineProperty(navigator.gpu, 'requestAdapter', {
        value: requestAdapter,
        configurable: true
      });
    }
  `);
}
