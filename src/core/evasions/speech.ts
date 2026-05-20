import type { AccountFingerprint } from '../fingerprint.js';
import { json, toStringMaskingPrelude, wrap } from './utils.js';

interface VoiceProfile {
  default: boolean;
  lang: string;
  localService: boolean;
  name: string;
  voiceURI: string;
}

const WINDOWS_VOICES: VoiceProfile[] = [
  {
    default: true,
    lang: 'en-US',
    localService: true,
    name: 'Microsoft David - English (United States)',
    voiceURI: 'Microsoft David - English (United States)',
  },
  {
    default: false,
    lang: 'en-US',
    localService: true,
    name: 'Microsoft Zira - English (United States)',
    voiceURI: 'Microsoft Zira - English (United States)',
  },
];

export function buildScript(_fp: AccountFingerprint): string {
  return wrap(`
    ${toStringMaskingPrelude()}
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices) {
      const voices = ${json(WINDOWS_VOICES)};
      const native = speechSynthesis.getVoices.bind(speechSynthesis);
      const getVoices = __sfMaskNative(function getVoices() {
        return voices.map((voice) => Object.freeze({ ...voice }));
      }, native);
      Object.defineProperty(speechSynthesis, 'getVoices', {
        value: getVoices,
        configurable: true
      });
      setTimeout(() => {
        try {
          speechSynthesis.dispatchEvent(new Event('voiceschanged'));
        } catch {}
      }, 0);
    }
  `);
}
