import { VoiceProvider } from '@genfeedai/enums';

export const DEFAULT_VOICE_REF_SOURCES = ['catalog', 'cloned'] as const;

export type DefaultVoiceRefSource = (typeof DEFAULT_VOICE_REF_SOURCES)[number];

export const DEFAULT_VOICE_REF_PROVIDERS = [
  VoiceProvider.ELEVENLABS,
  VoiceProvider.HEYGEN,
  VoiceProvider.GENFEED_AI,
] as const;
