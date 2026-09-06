import type { IElementMood } from '@genfeedai/contracts/interfaces';
import type { ElementMood } from '@models/elements/mood.model';

export interface MoodsListState {
  adminOrg: string;
  adminBrand: string;
  moods: ElementMood[];
  isLoading: boolean;
  selectedMood: IElementMood | null;
}

export type MoodsListAction =
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ADMIN_ORG_CLEAR_BRAND'; payload: string }
  | { type: 'SET_MOODS'; payload: ElementMood[] }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_MOOD'; payload: IElementMood | null };
