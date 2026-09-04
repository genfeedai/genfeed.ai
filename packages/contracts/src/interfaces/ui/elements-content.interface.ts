import type { ContentProps } from '../common/content-scope.interface';
import type { IFiltersState } from '../utils/filters.interface';

export interface IElementContentHandle {
  refresh: () => void;
}

export interface IElementContentProps extends ContentProps {
  filters?: IFiltersState;
  onRefresh?: (callback: () => void) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefreshingChange?: (isRefreshing: boolean) => void;
}
