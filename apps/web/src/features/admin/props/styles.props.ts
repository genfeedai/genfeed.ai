import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { ElementStyle } from '@models/elements/style.model';

export interface StylesListState {
  page: IPaginatedResponse<ElementStyle> | null;
  isLoading: boolean;
}

export type StylesListAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PAGE'; payload: IPaginatedResponse<ElementStyle> };
