import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { Preset } from '@models/elements/preset.model';

export interface PresetsListModalsProps {
  scope: ContentScope;
  selectedPreset: Preset | null | undefined;
  onClose: () => void;
  onConfirm: () => void;
}
