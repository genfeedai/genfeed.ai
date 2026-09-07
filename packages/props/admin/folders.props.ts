import type { IFolder } from '@genfeedai/contracts/interfaces';
import type {
  IFilters,
  IFiltersState,
} from '@genfeedai/contracts/interfaces/utils/filters.interface';
import type { ContentProps } from '@props/layout/content.props';

export interface FoldersListModalsProps {
  selectedFolder: IFolder | null;
  onConfirm: () => void;
  scope: ContentProps['scope'];
}

export interface FoldersListState {
  selectedFolder: IFolder | null;
  adminOrg: string;
  adminBrand: string;
  query: IFilters;
  filters: IFiltersState;
}

export type FoldersListAction =
  | { type: 'SET_SELECTED_FOLDER'; payload: IFolder | null }
  | { type: 'SET_ADMIN_ORG'; payload: string }
  | { type: 'SET_ADMIN_BRAND'; payload: string }
  | { type: 'SET_ORG_AND_CLEAR_BRAND'; payload: string }
  | { type: 'SET_QUERY'; payload: IFilters }
  | { type: 'SET_FILTERS'; payload: IFiltersState }
  | {
      type: 'SET_FILTERS_AND_QUERY';
      payload: { filters: IFiltersState; query: IFilters };
    };
