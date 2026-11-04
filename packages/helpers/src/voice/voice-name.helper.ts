export interface VoiceNameSource {
  id: string;
  metadataLabel?: string;
  externalVoiceId?: string;
}

/** Display name for a voice: its label, else the provider voice id, else our id. */
export function getVoiceName(voice: VoiceNameSource): string {
  return voice.metadataLabel || voice.externalVoiceId || voice.id;
}
