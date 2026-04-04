import type { ReactNode } from 'react';

export interface InfiniteScrollProps {
  onLoadMore: () => void | Promise<void>;
  hasMore: boolean;
  isLoading?: boolean;
  children: ReactNode;
  className?: string;
  loadingIndicator?: ReactNode;
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
}
