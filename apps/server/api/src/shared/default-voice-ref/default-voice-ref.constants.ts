export const DEFAULT_VOICE_REF_SOURCES = ['catalog', 'cloned'] as const;

export type DefaultVoiceRefSource = (typeof DEFAULT_VOICE_REF_SOURCES)[number];
