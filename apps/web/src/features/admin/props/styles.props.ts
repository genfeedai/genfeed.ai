import type { ElementStyle } from '@models/elements/style.model';

export interface StylesListState {
  styles: ElementStyle[];
  isLoading: boolean;
  selectedStyle: ElementStyle | null;
}

export type StylesListAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_STYLES'; payload: ElementStyle[] }
  | { type: 'SET_SELECTED_STYLE'; payload: ElementStyle | null };
