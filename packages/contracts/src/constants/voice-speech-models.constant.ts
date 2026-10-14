import { VoiceProvider } from '../enums/voice.enum';
import { MODEL_KEYS } from './model-keys.constant';

/** A text-to-speech catalog row and the voice catalog it can speak with. */
export interface VoiceSpeechModel {
  /** Documented per-request text limit, in characters. */
  maxCharacters: number;
  /** The provider's own model id sent on the TTS request. */
  providerModelId: string;
  /** Voices from this provider's catalog are the only ones it can speak. */
  voiceProvider: VoiceProvider;
}

/**
 * The VOICE-category rows that generate speech from text. The VOICE category
 * also carries avatar rows (`heygen/avatar`, `argil/atom`), so Studio Voice and
 * `/voices/generate` admit only these keys. Limits come from the provider docs:
 * ElevenLabs models overview and HeyGen Voice API notes (2026-10-14).
 */
export const VOICE_SPEECH_MODELS: Readonly<Record<string, VoiceSpeechModel>> = {
  [MODEL_KEYS.ELEVENLABS_V4]: {
    maxCharacters: 10_000,
    providerModelId: 'eleven_v4',
    voiceProvider: VoiceProvider.ELEVENLABS,
  },
  [MODEL_KEYS.ELEVENLABS_MULTILINGUAL_V2]: {
    maxCharacters: 10_000,
    providerModelId: 'eleven_multilingual_v2',
    voiceProvider: VoiceProvider.ELEVENLABS,
  },
  [MODEL_KEYS.ELEVENLABS_FLASH_V2_5]: {
    maxCharacters: 40_000,
    providerModelId: 'eleven_flash_v2_5',
    voiceProvider: VoiceProvider.ELEVENLABS,
  },
  [MODEL_KEYS.HEYGEN_VOICE]: {
    maxCharacters: 5_000,
    providerModelId: 'heygen-voice-1',
    voiceProvider: VoiceProvider.HEYGEN,
  },
};

/** Voice providers Studio can generate speech with. */
export const SPEECH_VOICE_PROVIDERS: readonly VoiceProvider[] = [
  VoiceProvider.ELEVENLABS,
  VoiceProvider.HEYGEN,
];

export function getVoiceSpeechModel(
  key: string | null | undefined,
): VoiceSpeechModel | undefined {
  return key ? VOICE_SPEECH_MODELS[key] : undefined;
}

export function isVoiceSpeechModel(key: string | null | undefined): boolean {
  return getVoiceSpeechModel(key) !== undefined;
}

/** Speech model keys that can speak a voice from `voiceProvider`. */
export function voiceSpeechModelKeysFor(
  voiceProvider: VoiceProvider,
): string[] {
  return Object.entries(VOICE_SPEECH_MODELS)
    .filter(([, model]) => model.voiceProvider === voiceProvider)
    .map(([key]) => key);
}

/**
 * Billable characters: Unicode code points, spaces and punctuation included,
 * on the exact text sent. HeyGen documents this count; ElevenLabs bills per
 * submitted character and is counted the same way.
 */
export function countSpeechCharacters(text: string): number {
  return Array.from(text).length;
}
