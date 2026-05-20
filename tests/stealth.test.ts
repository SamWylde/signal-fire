// LIVE BROWSER TESTS — opt-in only.
// These tests launch real Chrome via Patchright and will steal focus during the run.
// To enable: set RUN_LIVE_BROWSER_TESTS=1 in your environment, then run pnpm test.
// PowerShell: $env:RUN_LIVE_BROWSER_TESTS='1'; pnpm test
// Bash:       RUN_LIVE_BROWSER_TESTS=1 pnpm test
import * as fs from 'node:fs/promises';
import { type Server, createServer } from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findChromeExecutable, launchBrowser } from '../src/core/browser.js';
import { webglProfileForFingerprint } from '../src/core/evasions/webgl-profiles.js';
import type { AccountFingerprint } from '../src/core/fingerprint.js';

interface ProbeResult {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  webdriverType: string;
  runtimeEnableLeak: boolean;
  sourceUrlLeak: boolean;
  userAgentData: {
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
    platform: string;
    highEntropy: {
      architecture: string;
      bitness: string;
      brands: Array<{ brand: string; version: string }>;
      fullVersionList: Array<{ brand: string; version: string }>;
      platform: string;
      platformVersion: string;
      uaFullVersion: string;
    };
  } | null;
  pluginsLength: number;
  webglVendor: string | null;
  webglRenderer: string | null;
  webglParamsById: Record<string, number | string | number[] | { error: string }>;
  webglParams: {
    aliasedLineWidthRange: number[];
    aliasedPointSizeRange: number[];
    maxCombinedTextureImageUnits: number;
    maxCubeMapTextureSize: number;
    maxFragmentUniformVectors: number;
    maxRenderbufferSize: number;
    maxTextureImageUnits: number;
    maxTextureSize: number;
    maxVaryingVectors: number;
    maxVertexAttribs: number;
    maxVertexTextureImageUnits: number;
    maxVertexUniformVectors: number;
    maxViewportDims: number[];
    renderer: string;
    shadingLanguageVersion: string;
    vendor: string;
    version: string;
  } | null;
  webglExtensions: string[];
  webglPrecision: {
    fragmentHighFloat: { precision: number; rangeMax: number; rangeMin: number };
    vertexHighFloat: { precision: number; rangeMax: number; rangeMin: number };
  } | null;
  canvasHash: string;
  textMetrics: {
    width: number;
    repeatedWidth: number;
    actualBoundingBoxAscent: number;
    actualBoundingBoxDescent: number;
  };
  timezone: string;
  matchMedia: Record<string, boolean>;
  battery: {
    charging: boolean;
    chargingTime: number | null;
    dischargingTime: number | null;
    level: number;
  } | null;
  storageEstimate: {
    quota?: number;
    usage?: number;
    usageDetails?: Record<string, number>;
  } | null;
  webgpuInfo: {
    architecture?: string;
    description?: string;
    device?: string;
    error?: string;
    vendor?: string;
  } | null;
  workerProbe: {
    error?: string;
    ua?: string;
    vendor?: string;
  } | null;
  mediaDevices: Array<{
    deviceId: string;
    groupId: string;
    kind: string;
    label: string;
  }>;
  connection: {
    downlink: number;
    effectiveType: string;
    rtt: number;
    saveData: boolean;
    type: string;
  } | null;
  notificationPermission: string | null;
  notificationQuery: string | null;
  permissionStates: Record<string, string>;
  voices: Array<{
    default: boolean;
    lang: string;
    localService: boolean;
    name: string;
    voiceURI: string;
  }>;
  hasChromeRuntime: boolean;
  languages: string[];
  languagesFrozen: boolean;
  language: string;
  nativeToString: {
    webglGetParameter: boolean;
    webglGetSupportedExtensions: boolean;
    webglGetExtension: boolean;
    webglGetShaderPrecisionFormat: boolean;
    canvasGetImageData: boolean;
    canvasToDataURL: boolean;
    canvasMeasureText: boolean;
    audioGetChannelData: boolean;
    mediaDevicesEnumerate: boolean;
    permissionsQuery: boolean;
    speechGetVoices: boolean;
    userAgentDataGetter: boolean;
    userAgentDataGetHighEntropy: boolean;
    matchMedia: boolean;
    getBattery: boolean;
    storageEstimate: boolean;
    webgpuRequestAdapter: boolean;
    workerConstructor: boolean;
    sharedWorkerConstructor: boolean;
    serviceWorkerRegister: boolean;
    navigatorPlatformGetter: boolean;
    navigatorMaxTouchPointsGetter: boolean;
  };
  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
  };
  devicePixelRatio: number;
}

let tmpDir: string;
const originalHome = process.env.SIGNAL_FIRE_HOME;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-stealth-test-'));
  process.env.SIGNAL_FIRE_HOME = tmpDir;
});

afterEach(async () => {
  if (originalHome === undefined) {
    Reflect.deleteProperty(process.env, 'SIGNAL_FIRE_HOME');
  } else {
    process.env.SIGNAL_FIRE_HOME = originalHome;
  }
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function startProbeServer(): Promise<{
  server: Server;
  url: string;
  nextProbe: () => Promise<ProbeResult>;
}> {
  const fixturePath = path.resolve('tests/fixtures/fingerprint-probe.html');
  const pending: Array<(result: ProbeResult) => void> = [];

  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/fingerprint-probe.html')) {
      const body = await fs.readFile(fixturePath);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
      return;
    }

    if (req.method === 'POST' && req.url === '/probe') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as ProbeResult;
      pending.shift()?.(result);
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address !== 'object' || address === null) {
        throw new Error('Probe server did not bind to a TCP address');
      }
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/fingerprint-probe.html`,
        nextProbe: () => new Promise<ProbeResult>((probeResolve) => pending.push(probeResolve)),
      });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err === undefined ? resolve() : reject(err)));
  });
}

async function runProbe(
  url: string,
  accountId: string,
): Promise<{
  result: ProbeResult;
  fingerprint: AccountFingerprint;
}> {
  const { context, fingerprint, close } = await launchBrowser({
    accountId,
    platform: 'x',
  });
  try {
    const page = await context.newPage();
    const probePromise = currentProbeServer.nextProbe();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const timeoutPromise = new Promise<ProbeResult>((_, reject) => {
      setTimeout(async () => {
        const body = await page.textContent('body').catch(() => null);
        reject(new Error(`Probe did not post results. Body text: ${body ?? '<unavailable>'}`));
      }, 15_000);
    });
    return { result: await Promise.race([probePromise, timeoutPromise]), fingerprint };
  } finally {
    await close();
  }
}

let currentProbeServer: Awaited<ReturnType<typeof startProbeServer>>;

function userAgentMajor(userAgent: string): string {
  const match = /Chrome\/([0-9]+)/.exec(userAgent);
  return match?.[1] ?? '';
}

function uaDataPlatform(_platform: AccountFingerprint['platform']): string {
  return 'Windows';
}

function webgpuVendor(renderer: string): string {
  const lower = renderer.toLowerCase();
  if (lower.includes('nvidia')) return 'nvidia';
  if (lower.includes('amd') || lower.includes('radeon')) return 'amd';
  if (lower.includes('swiftshader') || lower.includes('google')) return 'google';
  return 'intel';
}

const hasChrome = findChromeExecutable() !== null;
const runLive = process.env.RUN_LIVE_BROWSER_TESTS === '1';

describe.skipIf(!hasChrome || !runLive)('fingerprint evasions', () => {
  it('applies stable per-account fingerprint evasions', async () => {
    currentProbeServer = await startProbeServer();
    try {
      const aliceOne = await runProbe(currentProbeServer.url, 'alice');
      const aliceTwo = await runProbe(currentProbeServer.url, 'alice');
      const bob = await runProbe(currentProbeServer.url, 'bob');

      expect(aliceOne.result.userAgent).toMatch(/Chrome\/\d+/);
      expect(aliceOne.result.userAgent).not.toContain('HeadlessChrome');
      expect(aliceOne.result.platform).toBe(aliceOne.fingerprint.platform);
      expect(aliceOne.result.maxTouchPoints).toBe(0);
      expect(aliceOne.result.webdriverType).toBe('undefined');
      expect(typeof aliceOne.result.runtimeEnableLeak).toBe('boolean');
      expect(aliceOne.result.runtimeEnableLeak).toBe(false);
      expect(aliceOne.result.sourceUrlLeak).toBe(false);
      expect(aliceOne.result.userAgentData).not.toBeNull();
      expect(aliceOne.result.userAgentData?.brands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            brand: 'Google Chrome',
            version: userAgentMajor(aliceOne.result.userAgent),
          }),
        ]),
      );
      expect(aliceOne.result.userAgentData?.mobile).toBe(false);
      expect(aliceOne.result.userAgentData?.platform).toBe(
        uaDataPlatform(aliceOne.fingerprint.platform),
      );
      expect(aliceOne.result.userAgentData?.highEntropy).toMatchObject({
        architecture: 'x86',
        bitness: '64',
        platform: uaDataPlatform(aliceOne.fingerprint.platform),
      });
      expect(aliceOne.result.userAgentData?.highEntropy.fullVersionList).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            brand: 'Google Chrome',
            version: expect.stringMatching(/^\d+\.\d+\.\d+\.\d+$/),
          }),
        ]),
      );
      expect(aliceOne.result.pluginsLength).toBeGreaterThan(0);
      expect(aliceOne.result.webglVendor).toBe(aliceOne.fingerprint.webglVendor);
      expect(aliceOne.result.webglRenderer).toBe(aliceOne.fingerprint.webglRenderer);
      const expectedWebgl = webglProfileForFingerprint(aliceOne.fingerprint);
      expect(Object.keys(expectedWebgl.parameters).length).toBeGreaterThanOrEqual(50);
      for (const [paramId, expectedValue] of Object.entries(expectedWebgl.parameters)) {
        expect(aliceOne.result.webglParamsById[paramId]).toEqual(expectedValue);
      }
      expect(aliceOne.result.webglParams).toMatchObject({
        maxTextureSize: expectedWebgl.parameters['3379'],
        maxCubeMapTextureSize: expectedWebgl.parameters['34076'],
        maxRenderbufferSize: expectedWebgl.parameters['34024'],
        maxTextureImageUnits: expectedWebgl.parameters['34930'],
        maxVertexAttribs: expectedWebgl.parameters['34921'],
        maxVertexUniformVectors: expectedWebgl.parameters['36347'],
        maxFragmentUniformVectors: expectedWebgl.parameters['36349'],
        maxVaryingVectors: expectedWebgl.parameters['36348'],
        maxVertexTextureImageUnits: expectedWebgl.parameters['35660'],
        maxCombinedTextureImageUnits: expectedWebgl.parameters['35661'],
      });
      expect(aliceOne.result.webglParams?.maxViewportDims).toEqual(
        expectedWebgl.parameters['3386'],
      );
      expect(aliceOne.result.webglParams?.aliasedLineWidthRange).toEqual(
        expectedWebgl.parameters['33902'],
      );
      expect(aliceOne.result.webglParams?.aliasedPointSizeRange).toEqual(
        expectedWebgl.parameters['33901'],
      );
      expect(aliceOne.result.webglExtensions).toEqual(
        expect.arrayContaining(['WEBGL_debug_renderer_info', 'OES_texture_float']),
      );
      expect(aliceOne.result.webglPrecision?.fragmentHighFloat).toMatchObject({
        precision: 23,
        rangeMax: 127,
        rangeMin: 127,
      });
      expect(aliceOne.result.textMetrics.repeatedWidth).toBe(aliceOne.result.textMetrics.width);
      expect(aliceOne.result.timezone).toBe(aliceOne.fingerprint.timezoneId);
      expect(aliceOne.result.matchMedia).toMatchObject({
        '(hover: hover)': true,
        '(hover: none)': false,
        '(pointer: fine)': true,
        '(pointer: coarse)': false,
        '(any-pointer: fine)': true,
        '(any-pointer: coarse)': false,
        '(prefers-reduced-motion: reduce)': false,
        '(prefers-contrast: more)': false,
        '(prefers-reduced-transparency: reduce)': false,
        '(forced-colors: active)': false,
        '(prefers-reduced-data: reduce)': false,
      });
      expect(
        aliceOne.result.matchMedia['(prefers-color-scheme: dark)'] !==
          aliceOne.result.matchMedia['(prefers-color-scheme: light)'],
      ).toBe(true);
      expect(aliceOne.result.battery).toMatchObject({
        charging: true,
        chargingTime: null,
        dischargingTime: null,
      });
      expect(aliceOne.result.battery?.level).toBeGreaterThanOrEqual(0.85);
      expect(aliceOne.result.battery?.level).toBeLessThanOrEqual(1);
      expect(aliceOne.result.storageEstimate?.quota).toBeGreaterThan(1_000_000_000_000);
      expect(aliceOne.result.storageEstimate?.usage).toBeGreaterThan(0);
      if (aliceOne.result.webgpuInfo && !aliceOne.result.webgpuInfo.error) {
        expect(aliceOne.result.webgpuInfo.vendor).toBe(
          webgpuVendor(aliceOne.fingerprint.webglRenderer),
        );
        expect(aliceOne.result.webgpuInfo.description).toBe(aliceOne.fingerprint.webglRenderer);
      }
      expect(aliceOne.result.workerProbe).toMatchObject({
        ua: aliceOne.result.userAgent,
      });
      expect(aliceOne.result.mediaDevices.map((device) => device.kind).sort()).toEqual([
        'audioinput',
        'audiooutput',
        'videoinput',
      ]);
      expect(aliceOne.result.mediaDevices.every((device) => device.label === '')).toBe(true);
      expect(aliceOne.result.connection).toMatchObject({
        effectiveType: '4g',
        saveData: false,
        type: 'wifi',
      });
      expect(aliceOne.result.connection?.rtt).toBeGreaterThan(0);
      expect(aliceOne.result.connection?.downlink).toBeGreaterThan(0);
      expect(aliceOne.result.notificationPermission).toBe('default');
      expect(aliceOne.result.notificationQuery).toBe('prompt');
      expect(aliceOne.result.permissionStates).toMatchObject({
        camera: 'prompt',
        'clipboard-read': 'prompt',
        'clipboard-write': 'prompt',
        geolocation: 'prompt',
        microphone: 'prompt',
        midi: 'prompt',
        'midi-sysex': 'prompt',
        notifications: 'prompt',
      });
      expect(aliceOne.result.voices.length).toBeGreaterThan(0);
      expect(typeof aliceOne.result.hasChromeRuntime).toBe('boolean');
      expect(aliceOne.result.languages).toEqual(aliceOne.fingerprint.languages);
      expect(aliceOne.result.languagesFrozen).toBe(true);
      expect(aliceOne.result.language).toBe(aliceOne.fingerprint.languages[0]);
      expect(aliceOne.result.nativeToString).toEqual({
        webglGetParameter: true,
        webglGetSupportedExtensions: true,
        webglGetExtension: true,
        webglGetShaderPrecisionFormat: true,
        canvasGetImageData: true,
        canvasToDataURL: true,
        canvasMeasureText: true,
        audioGetChannelData: true,
        mediaDevicesEnumerate: true,
        permissionsQuery: true,
        speechGetVoices: true,
        userAgentDataGetter: true,
        userAgentDataGetHighEntropy: true,
        matchMedia: true,
        getBattery: true,
        storageEstimate: true,
        webgpuRequestAdapter: true,
        workerConstructor: true,
        sharedWorkerConstructor: true,
        serviceWorkerRegister: true,
        navigatorPlatformGetter: true,
        navigatorMaxTouchPointsGetter: true,
      });
      expect(aliceOne.result.screen.width).toBe(aliceOne.fingerprint.screenWidth);
      expect(aliceOne.result.screen.height).toBe(aliceOne.fingerprint.screenHeight);
      expect(aliceOne.result.devicePixelRatio).toBeGreaterThanOrEqual(1);
      expect(aliceTwo.result.canvasHash).toBe(aliceOne.result.canvasHash);
      expect(aliceTwo.result.textMetrics.width).toBe(aliceOne.result.textMetrics.width);
      expect(bob.result.canvasHash).not.toBe(aliceOne.result.canvasHash);
      expect(bob.result.textMetrics.width).not.toBe(aliceOne.result.textMetrics.width);
    } finally {
      await closeServer(currentProbeServer.server);
    }
  }, 60_000);
});
