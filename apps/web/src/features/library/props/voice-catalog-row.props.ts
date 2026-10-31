import type { Voice } from '@models/ingredients/voice.model';

export interface VoiceCatalogRowProps {
  isBrandDefault: boolean;
  isOrgDefault: boolean;
  isSavingBrandDefault: boolean;
  isSavingOrgDefault: boolean;
  onDelete?: (() => void) | null;
  onSaveBrandDefault?: (() => void) | null;
  onSaveOrganizationDefault: () => void;
  selectedBrandLabel?: string;
  voice: Voice;
}
