import type { AccountFingerprint } from '../fingerprint.js';

export type WebGLParamValue = number | string | readonly [number, number];

export const WEBGL_PARAM_NAMES = {
  VENDOR: 7936,
  RENDERER: 7937,
  VERSION: 7938,
  SUBPIXEL_BITS: 3408,
  RED_BITS: 3410,
  GREEN_BITS: 3411,
  BLUE_BITS: 3412,
  ALPHA_BITS: 3413,
  DEPTH_BITS: 3414,
  STENCIL_BITS: 3415,
  MAX_TEXTURE_SIZE: 3379,
  MAX_VIEWPORT_DIMS: 3386,
  ALIASED_POINT_SIZE_RANGE: 33901,
  ALIASED_LINE_WIDTH_RANGE: 33902,
  MAX_TEXTURE_LOD_BIAS: 34045,
  MAX_CUBE_MAP_TEXTURE_SIZE: 34076,
  MAX_RENDERBUFFER_SIZE: 34024,
  MAX_VERTEX_ATTRIBS: 34921,
  MAX_TEXTURE_IMAGE_UNITS: 34930,
  MAX_VERTEX_UNIFORM_COMPONENTS: 35658,
  MAX_VERTEX_UNIFORM_VECTORS: 36347,
  MAX_VARYING_COMPONENTS: 35659,
  MAX_VARYING_VECTORS: 36348,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
  MAX_FRAGMENT_UNIFORM_COMPONENTS: 35657,
  MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
  SHADING_LANGUAGE_VERSION: 35724,
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047,
  MAX_3D_TEXTURE_SIZE: 32883,
  MAX_ELEMENTS_VERTICES: 33000,
  MAX_ELEMENTS_INDICES: 33001,
  MAX_ARRAY_TEXTURE_LAYERS: 35071,
  MIN_PROGRAM_TEXEL_OFFSET: 35076,
  MAX_PROGRAM_TEXEL_OFFSET: 35077,
  MAX_UNIFORM_BUFFER_BINDINGS: 35375,
  MAX_UNIFORM_BLOCK_SIZE: 35376,
  UNIFORM_BUFFER_OFFSET_ALIGNMENT: 35380,
  MAX_VERTEX_UNIFORM_BLOCKS: 35371,
  MAX_FRAGMENT_UNIFORM_BLOCKS: 35373,
  MAX_COMBINED_UNIFORM_BLOCKS: 35374,
  MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: 35377,
  MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 35379,
  MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS: 35968,
  MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS: 35978,
  MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: 35979,
  MAX_COLOR_ATTACHMENTS: 36063,
  MAX_SAMPLES: 36183,
  MAX_DRAW_BUFFERS: 34852,
  MAX_ELEMENT_INDEX: 36203,
  MAX_CLIENT_WAIT_TIMEOUT_WEBGL: 37447,
  MAX_VERTEX_OUTPUT_COMPONENTS: 37154,
  MAX_FRAGMENT_INPUT_COMPONENTS: 37157,
  UNMASKED_VENDOR_WEBGL: 37445,
  UNMASKED_RENDERER_WEBGL: 37446,
} as const;

type WebGLParamName = keyof typeof WEBGL_PARAM_NAMES;
type ShaderPrecisionProfile = Record<
  string,
  { precision: number; rangeMax: number; rangeMin: number }
>;

export interface WebGLProfile {
  extensions: string[];
  parameters: Record<WebGLParamName, WebGLParamValue>;
  shaderPrecision: ShaderPrecisionProfile;
}

export interface WebGLRuntimeProfile {
  extensions: string[];
  parameters: Record<string, WebGLParamValue>;
  shaderPrecision: ShaderPrecisionProfile;
  webglRenderer: string;
  webglVendor: string;
}

const COMMON_EXTENSIONS = [
  'ANGLE_instanced_arrays',
  'EXT_blend_minmax',
  'EXT_color_buffer_half_float',
  'EXT_disjoint_timer_query',
  'EXT_float_blend',
  'EXT_frag_depth',
  'EXT_shader_texture_lod',
  'EXT_sRGB',
  'OES_element_index_uint',
  'OES_fbo_render_mipmap',
  'OES_standard_derivatives',
  'OES_texture_float',
  'OES_texture_float_linear',
  'OES_texture_half_float',
  'OES_texture_half_float_linear',
  'OES_vertex_array_object',
  'WEBGL_color_buffer_float',
  'WEBGL_compressed_texture_s3tc',
  'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders',
  'WEBGL_depth_texture',
  'WEBGL_draw_buffers',
  'WEBGL_lose_context',
];

const S3TC_EXTENSIONS = ['EXT_texture_filter_anisotropic', 'WEBGL_compressed_texture_s3tc_srgb'];

const SHADER_PRECISION: ShaderPrecisionProfile = {
  '35632:36336': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632:36337': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632:36338': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35632:36339': { rangeMin: 31, rangeMax: 30, precision: 0 },
  '35632:36340': { rangeMin: 31, rangeMax: 30, precision: 0 },
  '35632:36341': { rangeMin: 31, rangeMax: 30, precision: 0 },
  '35633:36336': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633:36337': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633:36338': { rangeMin: 127, rangeMax: 127, precision: 23 },
  '35633:36339': { rangeMin: 31, rangeMax: 30, precision: 0 },
  '35633:36340': { rangeMin: 31, rangeMax: 30, precision: 0 },
  '35633:36341': { rangeMin: 31, rangeMax: 30, precision: 0 },
};

const BASE_PARAMETERS: Record<WebGLParamName, WebGLParamValue> = {
  VENDOR: 'WebKit',
  RENDERER: 'WebKit WebGL',
  VERSION: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
  SUBPIXEL_BITS: 4,
  RED_BITS: 8,
  GREEN_BITS: 8,
  BLUE_BITS: 8,
  ALPHA_BITS: 8,
  DEPTH_BITS: 24,
  STENCIL_BITS: 8,
  MAX_TEXTURE_SIZE: 16_384,
  MAX_VIEWPORT_DIMS: [32_767, 32_767],
  ALIASED_POINT_SIZE_RANGE: [1, 1024],
  ALIASED_LINE_WIDTH_RANGE: [1, 1],
  MAX_TEXTURE_LOD_BIAS: 15,
  MAX_CUBE_MAP_TEXTURE_SIZE: 16_384,
  MAX_RENDERBUFFER_SIZE: 16_384,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_UNIFORM_COMPONENTS: 16_384,
  MAX_VERTEX_UNIFORM_VECTORS: 4096,
  MAX_VARYING_COMPONENTS: 120,
  MAX_VARYING_VECTORS: 30,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_FRAGMENT_UNIFORM_COMPONENTS: 4096,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 16,
  MAX_3D_TEXTURE_SIZE: 2048,
  MAX_ELEMENTS_VERTICES: 1_048_575,
  MAX_ELEMENTS_INDICES: 1_048_575,
  MAX_ARRAY_TEXTURE_LAYERS: 2048,
  MIN_PROGRAM_TEXEL_OFFSET: -8,
  MAX_PROGRAM_TEXEL_OFFSET: 7,
  MAX_UNIFORM_BUFFER_BINDINGS: 72,
  MAX_UNIFORM_BLOCK_SIZE: 65_536,
  UNIFORM_BUFFER_OFFSET_ALIGNMENT: 256,
  MAX_VERTEX_UNIFORM_BLOCKS: 12,
  MAX_FRAGMENT_UNIFORM_BLOCKS: 12,
  MAX_COMBINED_UNIFORM_BLOCKS: 24,
  MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: 212_992,
  MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 200_704,
  MAX_TRANSFORM_FEEDBACK_SEPARATE_COMPONENTS: 4,
  MAX_TRANSFORM_FEEDBACK_INTERLEAVED_COMPONENTS: 64,
  MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: 4,
  MAX_COLOR_ATTACHMENTS: 8,
  MAX_SAMPLES: 4,
  MAX_DRAW_BUFFERS: 8,
  MAX_ELEMENT_INDEX: 4_294_967_294,
  MAX_CLIENT_WAIT_TIMEOUT_WEBGL: 0,
  MAX_VERTEX_OUTPUT_COMPONENTS: 64,
  MAX_FRAGMENT_INPUT_COMPONENTS: 128,
  UNMASKED_VENDOR_WEBGL: 'Google Inc.',
  UNMASKED_RENDERER_WEBGL: 'ANGLE',
};

function profile(
  overrides: Partial<Record<WebGLParamName, WebGLParamValue>>,
  extraExtensions: string[] = [],
): WebGLProfile {
  return {
    extensions: [...new Set([...COMMON_EXTENSIONS, ...extraExtensions])],
    parameters: {
      ...BASE_PARAMETERS,
      ...overrides,
    },
    shaderPrecision: SHADER_PRECISION,
  };
}

const INTEL_PROFILE = profile(
  {
    UNMASKED_VENDOR_WEBGL: 'Intel Inc.',
    MAX_FRAGMENT_UNIFORM_COMPONENTS: 4096,
    MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  },
  ['EXT_texture_filter_anisotropic'],
);

const NVIDIA_PROFILE = profile(
  {
    UNMASKED_VENDOR_WEBGL: 'NVIDIA Corporation',
    MAX_TEXTURE_SIZE: 32_768,
    MAX_CUBE_MAP_TEXTURE_SIZE: 32_768,
    MAX_RENDERBUFFER_SIZE: 32_768,
    MAX_FRAGMENT_UNIFORM_COMPONENTS: 16_384,
    MAX_FRAGMENT_UNIFORM_VECTORS: 4096,
    MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 212_992,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 16,
  },
  S3TC_EXTENSIONS,
);

const AMD_PROFILE = profile(
  {
    UNMASKED_VENDOR_WEBGL: 'AMD',
    MAX_FRAGMENT_UNIFORM_COMPONENTS: 16_384,
    MAX_FRAGMENT_UNIFORM_VECTORS: 4096,
    MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 212_992,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 16,
  },
  S3TC_EXTENSIONS,
);

const SWIFTSHADER_PROFILE = profile({
  UNMASKED_VENDOR_WEBGL: 'Google Inc.',
  MAX_VIEWPORT_DIMS: [16_384, 16_384],
  MAX_VERTEX_UNIFORM_COMPONENTS: 4096,
  MAX_VERTEX_UNIFORM_VECTORS: 1024,
  MAX_FRAGMENT_UNIFORM_COMPONENTS: 4096,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  MAX_COMBINED_VERTEX_UNIFORM_COMPONENTS: 53_248,
  MAX_COMBINED_FRAGMENT_UNIFORM_COMPONENTS: 53_248,
  MAX_TEXTURE_MAX_ANISOTROPY_EXT: 2,
});

function withRenderer(base: WebGLProfile, renderer: string): WebGLProfile {
  return {
    extensions: base.extensions,
    parameters: {
      ...base.parameters,
      UNMASKED_RENDERER_WEBGL: renderer,
    },
    shaderPrecision: base.shaderPrecision,
  };
}

export const WEBGL_PROFILES: Record<string, WebGLProfile> = {
  'Intel(R) Iris(R) Xe Graphics': withRenderer(INTEL_PROFILE, 'Intel(R) Iris(R) Xe Graphics'),
  'Intel(R) UHD Graphics 620': withRenderer(INTEL_PROFILE, 'Intel(R) UHD Graphics 620'),
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)': withRenderer(
    INTEL_PROFILE,
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ),
  'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': withRenderer(
    INTEL_PROFILE,
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ),
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)': withRenderer(
    NVIDIA_PROFILE,
    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ),
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)': withRenderer(
    NVIDIA_PROFILE,
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ),
  'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)': withRenderer(
    AMD_PROFILE,
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ),
  'AMD Radeon RX 6600 XT': withRenderer(AMD_PROFILE, 'AMD Radeon RX 6600 XT'),
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)':
    withRenderer(
      SWIFTSHADER_PROFILE,
      'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    ),
  'Google SwiftShader': withRenderer(SWIFTSHADER_PROFILE, 'Google SwiftShader'),
};

function parametersByEnum(parameters: Record<WebGLParamName, WebGLParamValue>) {
  const mapped: Record<string, WebGLParamValue> = {};
  for (const [name, value] of Object.entries(parameters) as Array<
    [WebGLParamName, WebGLParamValue]
  >) {
    mapped[String(WEBGL_PARAM_NAMES[name])] = value;
  }
  return mapped;
}

export function webglProfileForFingerprint(fp: AccountFingerprint): WebGLRuntimeProfile {
  const profileForRenderer =
    WEBGL_PROFILES[fp.webglRenderer] ??
    profile({
      UNMASKED_VENDOR_WEBGL: fp.webglVendor,
      UNMASKED_RENDERER_WEBGL: fp.webglRenderer,
    });
  const parameters = {
    ...profileForRenderer.parameters,
    UNMASKED_VENDOR_WEBGL: fp.webglVendor,
    UNMASKED_RENDERER_WEBGL: fp.webglRenderer,
  };

  return {
    extensions: profileForRenderer.extensions,
    parameters: parametersByEnum(parameters),
    shaderPrecision: profileForRenderer.shaderPrecision,
    webglVendor: fp.webglVendor,
    webglRenderer: fp.webglRenderer,
  };
}
