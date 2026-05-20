import type { BrowserContext } from '../browser.js';
import type { AccountFingerprint } from '../fingerprint.js';
import { buildScript as audio } from './audio.js';
import { buildScript as battery } from './battery.js';
import { buildScript as canvasText } from './canvas-text.js';
import { buildScript as canvas } from './canvas.js';
import { buildScript as fonts } from './fonts.js';
import { buildScript as iframeContentWindow } from './iframe-contentwindow.js';
import { buildScript as languages } from './languages.js';
import { buildScript as matchMedia } from './matchmedia.js';
import { buildScript as mediaCodecs } from './media-codecs.js';
import { buildScript as mediaDevices } from './media-devices.js';
import { buildScript as navigatorProps } from './navigator-props.js';
import { buildScript as network } from './network.js';
import { buildScript as permissions } from './permissions.js';
import { buildScript as plugins } from './plugins.js';
import { buildScript as screen } from './screen.js';
import { buildScript as speech } from './speech.js';
import { buildScript as storage } from './storage.js';
import type { EvasionBuilder } from './utils.js';
import { buildScript as webdriver } from './webdriver.js';
import { buildScript as webgl } from './webgl.js';
import { buildScript as webgpu } from './webgpu.js';

const EVASIONS: EvasionBuilder[] = [
  webdriver,
  webgl,
  canvas,
  canvasText,
  audio,
  fonts,
  mediaDevices,
  plugins,
  languages,
  navigatorProps,
  network,
  matchMedia,
  speech,
  battery,
  storage,
  webgpu,
  iframeContentWindow,
  mediaCodecs,
  permissions,
  screen,
];

export async function applyFingerprintEvasions(
  context: BrowserContext,
  fp: AccountFingerprint,
): Promise<void> {
  for (const buildScript of EVASIONS) {
    await context.addInitScript({ content: buildScript(fp) });
  }
}
