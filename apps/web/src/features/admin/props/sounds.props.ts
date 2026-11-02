import type {
  ContentScope,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
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

export type SoundFetchStatus = 'loading' | 'refreshing' | 'idle';

export interface SoundsListState {
  page: IPaginatedResponse<Sound> | null;
  fetchStatus: SoundFetchStatus;
  updatingIds: Set<string>;
}

export type SoundsListAction =
  | { type: 'FETCH_START'; isRefresh: boolean }
  | { type: 'FETCH_SUCCESS'; page: IPaginatedResponse<Sound> }
  | { type: 'FETCH_FINALLY' }
  | { type: 'ADD_UPDATING_ID'; id: string }
  | { type: 'REMOVE_UPDATING_ID'; id: string };
