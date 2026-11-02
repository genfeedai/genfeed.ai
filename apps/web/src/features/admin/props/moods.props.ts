import type { ElementMood } from '@models/elements/mood.model';

export interface MoodsListState {
  moods: ElementMood[];
  isLoading: boolean;
}

export type MoodsListAction =
  | { type: 'SET_MOODS'; payload: ElementMood[] }
  | { type: 'SET_IS_LOADING'; payload: boolean };
