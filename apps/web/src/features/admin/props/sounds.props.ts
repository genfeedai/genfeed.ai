import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { Sound } from '@models/ingredients/sound.model';

export interface BuildSoundsColumnsParams {
  updatingIds: Set<string>;
  scope: ContentScope;
  onToggleActive: (sound: Sound) => void;
  onToggleDefault: (sound: Sound) => void;
  scopeLabel: string;
  sortOrderLabel: string;
}

export interface SoundCellProps {
  sound: Sound;
}

export interface SoundCheckboxCellProps {
  sound: Sound;
  updatingIds: Set<string>;
  scope: ContentScope;
  onChange: (sound: Sound) => void;
}

export interface SoundsListModalsProps {
  scope: ContentScope;
  onConfirm: () => void;
}
