import { VoiceProvider } from '@genfeedai/enums';

export type DefaultVoiceRefSource = 'catalog' | 'cloned';

export interface DefaultVoiceCandidate {
  id: string;
  provider?: string;
  externalVoiceId?: string;
  isCloned?: boolean;
  metadataLabel?: string;
  sampleAudioUrl?: string | null;
  voiceSource?: 'catalog' | 'cloned' | 'generated';
}

export interface DefaultVoiceRef {
  source: DefaultVoiceRefSource;
  provider?: VoiceProvider;
  internalVoiceId?: string;
  externalVoiceId?: string;
  label?: string;
  preview?: string | null;
}

export function isCatalogVoiceRef(
  defaultVoiceRef?: DefaultVoiceRef | null,
): defaultVoiceRef is DefaultVoiceRef {
  return defaultVoiceRef?.source === 'catalog';
}

export function isClonedVoiceRef(
  defaultVoiceRef?: DefaultVoiceRef | null,
): defaultVoiceRef is DefaultVoiceRef {
  return defaultVoiceRef?.source === 'cloned';
}

export function encodeCatalogVoiceValue(
  provider: VoiceProvider,
  externalVoiceId: string,
): string {
  return `${provider}:${externalVoiceId}`;
}

export function decodeCatalogVoiceValue(value: string): {
  provider: VoiceProvider;
  externalVoiceId: string;
} | null {
  const separatorIndex = value.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const provider = value.slice(0, separatorIndex) as VoiceProvider;
  const externalVoiceId = value.slice(separatorIndex + 1);

  if (
    provider !== VoiceProvider.ELEVENLABS &&
    provider !== VoiceProvider.HEYGEN &&
    provider !== VoiceProvider.GENFEED_AI
  ) {
    return null;
  }

  return {
    externalVoiceId,
    provider,
  };
}

export function defaultVoiceRefToCatalogValue(
  defaultVoiceRef?: DefaultVoiceRef | null,
): string {
  if (
    defaultVoiceRef?.source !== 'catalog' ||
    !defaultVoiceRef.provider ||
    !defaultVoiceRef.externalVoiceId
  ) {
    return '';
  }

  return encodeCatalogVoiceValue(
    defaultVoiceRef.provider,
    defaultVoiceRef.externalVoiceId,
  );
}

export function buildDefaultVoiceRefFromVoice(
  voice: DefaultVoiceCandidate | null | undefined,
): DefaultVoiceRef | null {
  if (!voice) {
    return null;
  }

  if (
    voice.isCloned ||
    voice.voiceSource === 'cloned' ||
    voice.voiceSource === 'generated'
  ) {
    return {
      internalVoiceId: voice.id,
      label: voice.metadataLabel ?? voice.externalVoiceId ?? voice.id,
      provider: voice.provider as VoiceProvider | undefined,
      source: 'cloned',
    };
  }

  if (!voice.provider || !voice.externalVoiceId) {
    return null;
  }

  return {
    externalVoiceId: voice.externalVoiceId,
    label: voice.metadataLabel ?? voice.externalVoiceId ?? voice.id,
    preview: voice.sampleAudioUrl ?? null,
    provider: voice.provider as VoiceProvider,
    source: 'catalog',
  };
}

export function matchesDefaultVoice(
  input: {
    defaultVoiceId?: string | null;
    defaultVoiceRef?: DefaultVoiceRef | null;
  },
  voice: DefaultVoiceCandidate,
): boolean {
  if (input.defaultVoiceId && input.defaultVoiceId === voice.id) {
    return true;
  }

  if (
    input.defaultVoiceRef?.source === 'cloned' &&
    input.defaultVoiceRef.internalVoiceId === voice.id
  ) {
    return true;
  }

  return (
    input.defaultVoiceRef?.source === 'catalog' &&
    input.defaultVoiceRef.provider === voice.provider &&
    input.defaultVoiceRef.externalVoiceId === voice.externalVoiceId
  );
}
