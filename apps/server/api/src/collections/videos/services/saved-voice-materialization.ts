import { VoiceProvider } from '@genfeedai/enums';

export interface SavedVoiceMaterializationCandidate {
  externalVoiceId?: string | null;
  provider?: VoiceProvider | string | null;
  sampleAudioUrl?: string | null;
}

const PROVIDER_BACKED_VOICE_PROVIDERS = new Set<string>([
  VoiceProvider.ELEVENLABS,
  VoiceProvider.HEYGEN,
]);

function hasNonEmptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasSupportedExternalProviderId(
  candidate: SavedVoiceMaterializationCandidate,
): boolean {
  if (!hasNonEmptyValue(candidate.externalVoiceId)) {
    return false;
  }
  if (!hasNonEmptyValue(candidate.provider)) {
    return true;
  }
  return PROVIDER_BACKED_VOICE_PROVIDERS.has(candidate.provider);
}

export function hasMaterializableSampleAudio(
  candidate: SavedVoiceMaterializationCandidate,
): boolean {
  if (!hasNonEmptyValue(candidate.sampleAudioUrl)) {
    return false;
  }
  if (!hasNonEmptyValue(candidate.provider)) {
    return true;
  }
  return candidate.provider === VoiceProvider.GENFEED_AI;
}

export function isMaterializableSavedVoice(
  candidate: SavedVoiceMaterializationCandidate | null | undefined,
): boolean {
  if (!candidate) {
    return false;
  }
  return (
    hasSupportedExternalProviderId(candidate) ||
    hasMaterializableSampleAudio(candidate)
  );
}
