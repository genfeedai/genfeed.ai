import type { Voice } from '@models/ingredients/voice.model';

export interface ElevenLabsAccountVoicesDialogProps {
  /** Where the organization connects or replaces its ElevenLabs key. */
  connectHref: string;
  onClose: () => void;
  onImported: (voice: Voice) => void;
}
