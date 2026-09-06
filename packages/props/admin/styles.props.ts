import type { ElementStyle } from '@models/elements/style.model';

export interface StylesListState {
  styles: ElementStyle[];
  isLoading: boolean;
  selectedStyle: ElementStyle | null;
  adminOrg: string;
  adminBrand: string;
}

export type StylesListAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_STYLES'; payload: ElementStyle[] }
  | { type: 'SET_SELECTED_STYLE'; payload: ElementStyle | null }
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | {
      type: 'SET_ADMIN_FILTER';
      payload: { adminOrg: string; adminBrand: string };
    };
