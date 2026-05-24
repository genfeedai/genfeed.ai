import { VoiceProvider } from '@genfeedai/enums';
import type { Ingredient } from '@genfeedai/prisma';

export interface VoiceDocument extends Ingredient {
  externalVoiceId: string | null;
  provider?: VoiceProvider | null;
  sampleAudioUrl: string | null;
}
