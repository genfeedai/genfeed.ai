'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

export type RefreshFunction = () => void | Promise<void>;

type SetRefreshFunction = (
  refresh: RefreshFunction | (() => RefreshFunction),
) => void;

export const PostsLayoutContext = createContext<{
  setRefresh: SetRefreshFunction;
  setIsRefreshing: (isRefreshing: boolean) => void;
  setFiltersNode: (node: ReactNode) => void;
  setExportNode: (node: ReactNode) => void;
  setViewToggleNode: (node: ReactNode) => void;
  setScheduleActionsNode: (node: ReactNode) => void;
}>({
  setExportNode: () => {},
  setFiltersNode: () => {},
  setIsRefreshing: () => {},
  setRefresh: () => {},
  setScheduleActionsNode: () => {},
  setViewToggleNode: () => {},
});

export function usePostsLayout() {
  return useContext(PostsLayoutContext);
}
