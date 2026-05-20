import type { AccountFingerprint } from '../fingerprint.js';
import { json, toStringMaskingPrelude, wrap } from './utils.js';
import { webglProfileForFingerprint } from './webgl-profiles.js';

export function buildScript(fp: AccountFingerprint): string {
  const profile = webglProfileForFingerprint(fp);

  return wrap(`
    ${toStringMaskingPrelude()}
    const profile = ${json(profile)};
    const arrayParams = new Map([
      [3386, Int32Array],
      [33901, Float32Array],
      [33902, Float32Array]
    ]);
    const debugRendererInfo = Object.freeze({
      UNMASKED_VENDOR_WEBGL: 37445,
      UNMASKED_RENDERER_WEBGL: 37446
    });
    function profileValue(param) {
      const value = profile.parameters[String(param)];
      if (Array.isArray(value)) {
        const Type = arrayParams.get(param) || Array;
        return Type === Array ? [...value] : new Type(value);
      }
      return value;
    }
    function precisionValue(shaderType, precisionType) {
      const value = profile.shaderPrecision[String(shaderType) + ':' + String(precisionType)];
      return value
        ? Object.freeze({
            rangeMin: value.rangeMin,
            rangeMax: value.rangeMax,
            precision: value.precision
          })
        : undefined;
    }
    const patch = (proto) => {
      if (!proto || !proto.getParameter) return;
      const nativeGetParameter = proto.getParameter;
      const getParameter = __sfMaskNative(new Proxy(nativeGetParameter, {
          apply(target, thisArg, args) {
            const value = profileValue(args[0]);
            if (value !== undefined) return value;
            return Reflect.apply(target, thisArg, args);
          }
        }), nativeGetParameter);
      Object.defineProperty(proto, 'getParameter', {
        value: getParameter,
        configurable: true
      });
      if (proto.getSupportedExtensions) {
        const nativeGetSupportedExtensions = proto.getSupportedExtensions;
        const getSupportedExtensions = __sfMaskNative(new Proxy(nativeGetSupportedExtensions, {
          apply() {
            return [...profile.extensions];
          }
        }), nativeGetSupportedExtensions);
        Object.defineProperty(proto, 'getSupportedExtensions', {
          value: getSupportedExtensions,
          configurable: true
        });
      }
      if (proto.getExtension) {
        const nativeGetExtension = proto.getExtension;
        const getExtension = __sfMaskNative(new Proxy(nativeGetExtension, {
          apply(target, thisArg, args) {
            if (String(args[0]).toLowerCase() === 'webgl_debug_renderer_info') {
              return debugRendererInfo;
            }
            return Reflect.apply(target, thisArg, args);
          }
        }), nativeGetExtension);
        Object.defineProperty(proto, 'getExtension', {
          value: getExtension,
          configurable: true
        });
      }
      if (proto.getShaderPrecisionFormat) {
        const nativeGetShaderPrecisionFormat = proto.getShaderPrecisionFormat;
        const getShaderPrecisionFormat = __sfMaskNative(new Proxy(nativeGetShaderPrecisionFormat, {
          apply(target, thisArg, args) {
            return precisionValue(args[0], args[1]) || Reflect.apply(target, thisArg, args);
          }
        }), nativeGetShaderPrecisionFormat);
        Object.defineProperty(proto, 'getShaderPrecisionFormat', {
          value: getShaderPrecisionFormat,
          configurable: true
        });
      }
    };
    patch(typeof WebGLRenderingContext !== 'undefined' && WebGLRenderingContext.prototype);
    patch(typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype);
  `);
}
