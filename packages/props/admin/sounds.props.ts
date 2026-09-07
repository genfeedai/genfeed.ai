import type { ContentScope } from '@genfeedai/contracts/interfaces';
import type { Sound } from '@models/ingredients/sound.model';

export interface BuildSoundsColumnsParams {
  updatingIds: Set<string>;
  scope: ContentScope;
  onToggleActive: (sound: Sound) => void;
  onToggleDefault: (sound: Sound) => void;
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
  selectedSound: Sound | null;
  onConfirm: () => void;
}

export type SoundFetchStatus = 'loading' | 'refreshing' | 'idle';

export interface SoundsListState {
  sounds: Sound[];
  fetchStatus: SoundFetchStatus;
  updatingIds: Set<string>;
  selectedSound: Sound | null;
  adminOrg: string;
  adminBrand: string;
}

export type SoundsListAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; sounds: Sound[]; isRefresh: boolean }
  | { type: 'FETCH_FINALLY' }
  | { type: 'ADD_UPDATING_ID'; id: string }
  | { type: 'REMOVE_UPDATING_ID'; id: string }
  | { type: 'SET_SELECTED_SOUND'; sound: Sound | null }
  | { type: 'SET_ADMIN_ORG'; orgId: string }
  | { type: 'SET_ADMIN_BRAND'; brandId: string };
