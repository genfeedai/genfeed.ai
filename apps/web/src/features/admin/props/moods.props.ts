import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementMood } from '@models/elements/mood.model';

export interface MoodsListState {
  page: IPaginatedResponse<ElementMood> | null;
  isLoading: boolean;
}

export type MoodsListAction =
  | { type: 'SET_PAGE'; payload: IPaginatedResponse<ElementMood> }
  | { type: 'SET_IS_LOADING'; payload: boolean };
