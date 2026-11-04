import type { VoiceProvider } from '@genfeedai/contracts';
import type { HeyGenConnectionRef } from '@genfeedai/contracts/interfaces';

export type DefaultVoiceRefSource = 'catalog' | 'cloned';

export interface DefaultVoiceCandidate {
  id: string;
  provider?: string;
  externalVoiceId?: string;
  externalVoiceCatalogId?: string;
  isCloned?: boolean;
  metadataLabel?: string;
  sampleAudioUrl?: string | null;
  voiceSource?: 'catalog' | 'cloned' | 'generated' | 'imported';
}

export interface DefaultVoiceRef {
  ownership?: 'private' | 'public';
  connection?: HeyGenConnectionRef;
  source: DefaultVoiceRefSource;
  provider?: VoiceProvider;
  internalVoiceId?: string;
  externalVoiceId?: string;
  label?: string;
  preview?: string | null;
}

export function encodeCatalogVoiceValue(
  provider: VoiceProvider,
  externalVoiceId: string,
): string {
  return `${provider}:${externalVoiceId}`;
}

export function buildDefaultVoiceRefFromVoice(
  voice: DefaultVoiceCandidate | null | undefined,
): DefaultVoiceRef | null {
  if (!voice) {
    return null;
  }

  if (voice.externalVoiceCatalogId) {
    return {
      externalVoiceId: voice.externalVoiceId,
      label: voice.metadataLabel ?? voice.externalVoiceId ?? voice.id,
      preview: voice.sampleAudioUrl ?? null,
      provider: voice.provider as VoiceProvider | undefined,
      source: 'catalog',
    };
  }

  // Imported account voices are organization references like clones: the
  // server resolves their owning connection from the saved row.
  if (
    voice.isCloned ||
    voice.voiceSource === 'cloned' ||
    voice.voiceSource === 'generated' ||
    voice.voiceSource === 'imported'
  ) {
    return {
      internalVoiceId: voice.id,
      label: voice.metadataLabel ?? voice.externalVoiceId ?? voice.id,
      provider: voice.provider as VoiceProvider | undefined,
      source: 'cloned',
    };
  }

  return null;
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
