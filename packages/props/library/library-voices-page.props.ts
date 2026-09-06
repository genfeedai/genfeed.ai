import type { DefaultVoiceRef } from '@helpers/voice/default-voice-ref.helper';

export type SelectedBrandState = {
  agentConfig?: {
    defaultVoiceId?: string | null;
    defaultVoiceRef?: DefaultVoiceRef | null;
  };
  label?: string;
};
