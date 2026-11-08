import type { VoiceProvider } from '@genfeedai/contracts';
import type { Voice } from '@genfeedai/models/ingredients/voice.model';

/** Providers that clone a voice into the person's own account. */
export type VoiceStudioProvider =
  | VoiceProvider.ELEVENLABS
  | VoiceProvider.HEYGEN;

export type VoiceStudioPhase = 'preparing' | 'cloning';

/** Why a take is refused before anything is sent. */
export type VoiceSampleProblem = 'tooQuiet' | 'tooShort';

export interface VoiceStudioCreateInput {
  isBrandDefault: boolean;
  name: string;
  provider: VoiceStudioProvider;
  recording: File;
}

/** The voice made from one take, with what was asked for it. */
export interface VoiceStudioCreated {
  /** `failed`: the voice exists, but the brand default was not saved. */
  brandDefault: 'set' | 'failed' | 'skipped';
  provider: VoiceStudioProvider;
  voice: Voice;
}

export interface VoiceStudio {
  connectedProviders: VoiceStudioProvider[];
  create: (input: VoiceStudioCreateInput) => Promise<VoiceStudioCreated>;
  hasBrand: boolean;
  /** No account could be confirmed because the check itself failed. */
  hasConnectionError: boolean;
  isLoading: boolean;
  phase: VoiceStudioPhase | null;
  recheckConnections: () => void;
}

export interface VoiceStudioRecorderProps {
  connectedProviders: VoiceStudioProvider[];
  hasBrand: boolean;
  onCreate: (input: VoiceStudioCreateInput) => Promise<VoiceStudioCreated>;
  phase: VoiceStudioPhase | null;
  voicesHref: string;
}
