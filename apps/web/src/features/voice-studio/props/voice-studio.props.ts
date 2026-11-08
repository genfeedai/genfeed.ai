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

export interface VoiceStudio {
  connectedProviders: VoiceStudioProvider[];
  create: (input: VoiceStudioCreateInput) => Promise<Voice>;
  hasBrand: boolean;
  isLoading: boolean;
  phase: VoiceStudioPhase | null;
  recheckConnections: () => void;
}

export interface VoiceStudioRecorderProps {
  connectedProviders: VoiceStudioProvider[];
  hasBrand: boolean;
  onCreate: (input: VoiceStudioCreateInput) => Promise<Voice>;
  phase: VoiceStudioPhase | null;
  voicesHref: string;
}
