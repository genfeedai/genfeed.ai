import type { IElementMood } from '@genfeedai/contracts/interfaces';
import type { ElementMood } from '@models/elements/mood.model';

export interface MoodsListState {
  moods: ElementMood[];
  isLoading: boolean;
  selectedMood: IElementMood | null;
}

export type MoodsListAction =
  | { type: 'SET_MOODS'; payload: ElementMood[] }
  | { type: 'SET_IS_LOADING'; payload: boolean }
  | { type: 'SET_SELECTED_MOOD'; payload: IElementMood | null };
