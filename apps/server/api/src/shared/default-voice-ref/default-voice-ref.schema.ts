import { VoiceProvider } from '@genfeedai/contracts';
import type { DefaultVoiceRefSource } from './default-voice-ref.constants';

export interface DefaultVoiceRef {
  source: DefaultVoiceRefSource;
  provider: VoiceProvider;
  internalVoiceId?: string;
  externalVoiceId?: string;
  label?: string;
  preview?: string | null;
}
