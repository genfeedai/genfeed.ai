import type { ContentProps } from '../common/content-scope.interface';

export interface IElementContentHandle {
  refresh: () => void;
}

export interface IElementContentProps extends ContentProps {
  onRefresh?: (callback: () => void) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefreshingChange?: (isRefreshing: boolean) => void;
}
