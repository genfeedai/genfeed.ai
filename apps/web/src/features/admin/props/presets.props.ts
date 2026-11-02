import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { Preset } from '@models/elements/preset.model';

export interface PresetsListModalsProps {
  scope: ContentScope;
  onConfirm: () => void;
}

export interface PresetDescriptionActionsProps {
  preset: Preset;
  /** Saves the new description on the preset (a partial PATCH). */
  onSave: (description: string) => Promise<void>;
}
