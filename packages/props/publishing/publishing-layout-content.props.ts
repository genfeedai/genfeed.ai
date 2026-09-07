import type { RefreshFunction } from '@contexts/posts/posts-layout-context';
import type { ReactNode } from 'react';

export type PublishingLayoutState = {
  refreshFn: RefreshFunction | (() => RefreshFunction) | null;
  isRefreshing: boolean;
  filtersNode: ReactNode;
  exportNode: ReactNode;
  viewToggleNode: ReactNode;
  scheduleActionsNode: ReactNode;
};

export type PublishingLayoutAction =
  | {
      type: 'SET_REFRESH_FN';
      payload: RefreshFunction | (() => RefreshFunction) | null;
    }
  | { type: 'SET_IS_REFRESHING'; payload: boolean }
  | { type: 'SET_FILTERS_NODE'; payload: ReactNode }
  | { type: 'SET_EXPORT_NODE'; payload: ReactNode }
  | { type: 'SET_VIEW_TOGGLE_NODE'; payload: ReactNode }
  | { type: 'SET_SCHEDULE_ACTIONS_NODE'; payload: ReactNode };
