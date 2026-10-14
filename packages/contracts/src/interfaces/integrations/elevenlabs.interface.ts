/** The ElevenLabs account a saved voice or speech job is bound to. */
export interface ElevenLabsConnectionRef {
  provider: 'elevenlabs';
  kind: 'byok' | 'platform';
  organizationId: string;
  credentialVersionId?: string;
}

export type ElevenLabsConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'invalid';

export type ElevenLabsVoiceAvailability =
  | 'available'
  | 'restricted'
  | 'unavailable';

/** One voice from the connected account's catalog, not yet a saved reference. */
export interface ElevenLabsAccountVoice {
  externalVoiceId: string;
  name: string;
  category: string | null;
  preview: string | null;
  availability: ElevenLabsVoiceAvailability;
  restriction: string | null;
  /** Saved reference id when this organization already imported the voice. */
  savedVoiceId: string | null;
}

export interface ElevenLabsAccountVoicePage {
  connection: { status: ElevenLabsConnectionStatus };
  voices: ElevenLabsAccountVoice[];
  hasMore: boolean;
  nextPageToken: string | null;
}

/** Stored on saved ElevenLabs voice references under `providerData.elevenlabs`. */
export interface ElevenLabsSavedVoiceProviderData {
  version: 1;
  category: string | null;
  connection: ElevenLabsConnectionRef;
}

/**
 * Internal speech receipt on the generated audio ingredient. `state` makes
 * the paid provider call a one-way claim: a retry that finds `submitted`
 * without stored audio fails instead of paying for the request again.
 * Never serialize this through ingredient attributes.
 */
export interface ElevenLabsSpeechReceipt {
  version: 1;
  provider: 'elevenlabs';
  organizationId: string;
  connection: ElevenLabsConnectionRef;
  voice: {
    externalVoiceId: string;
    internalVoiceId?: string;
  };
  state: 'accepted' | 'submitted' | 'completed';
  /** When the provider call was claimed; bounds an in-flight duplicate. */
  submittedAt?: string;
}
