'use client';

import type { ReactNode } from 'react';
import { createContext, use } from 'react';

export type RefreshFunction = () => void | Promise<void>;

type SetRefreshFunction = (
  refresh: RefreshFunction | (() => RefreshFunction),
) => void;

export const PostsLayoutContext = createContext<{
  setRefresh: SetRefreshFunction;
  setIsRefreshing: (isRefreshing: boolean) => void;
  setFiltersNode: (node: ReactNode) => void;
  setLeadingNode: (node: ReactNode) => void;
  setOverflowNode: (node: ReactNode) => void;
  setViewToggleNode: (node: ReactNode) => void;
  setScheduleActionsNode: (node: ReactNode) => void;
}>({
  setOverflowNode: () => {},
  setFiltersNode: () => {},
  setIsRefreshing: () => {},
  setLeadingNode: () => {},
  setRefresh: () => {},
  setScheduleActionsNode: () => {},
  setViewToggleNode: () => {},
});

export function usePostsLayout() {
  return use(PostsLayoutContext);
}
