import type { DefaultVoiceRef } from '@helpers/voice/default-voice-ref.helper';
import type { Voice } from '@models/ingredients/voice.model';

type OrgDefaultContext = {
  defaultVoiceId?: string | null;
  defaultVoiceRef?: DefaultVoiceRef | null;
};

type BrandDefaultContext = {
  defaultVoiceId?: string | null;
  defaultVoiceRef?: DefaultVoiceRef | null;
};

export type VoiceLibraryRowItemProps = {
  brandDefaultContext: BrandDefaultContext;
  isVoiceRemovable: (voice: Voice) => boolean;
  onDeleteVoice: (voice: Voice) => Promise<void>;
  onSaveBrandDefault?: ((voice: Voice) => Promise<void>) | null;
  onSaveOrganizationDefault: (voice: Voice) => Promise<void>;
  orgDefaultContext: OrgDefaultContext;
  savingDefault: 'brand' | 'org' | null;
  selectedBrandLabel?: string;
  voice: Voice;
};
