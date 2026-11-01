'use client';

import type { RefreshFunction } from '@contexts/posts/posts-layout-context';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useReducer } from 'react';
import type {
  PublishingLayoutAction,
  PublishingLayoutState,
} from '@/features/posts/props/publishing-layout-content.props';

const INITIAL_STATE: PublishingLayoutState = {
  exportNode: null,
  filtersNode: null,
  isRefreshing: false,
  leadingNode: null,
  refreshFn: null,
  scheduleActionsNode: null,
  viewToggleNode: null,
};

function reducer(
  state: PublishingLayoutState,
  action: PublishingLayoutAction,
): PublishingLayoutState {
  switch (action.type) {
    case 'SET_REFRESH_FN':
      return { ...state, refreshFn: action.payload };
    case 'SET_IS_REFRESHING':
      return { ...state, isRefreshing: action.payload };
    case 'SET_LEADING_NODE':
      return { ...state, leadingNode: action.payload };
    case 'SET_FILTERS_NODE':
      return { ...state, filtersNode: action.payload };
    case 'SET_EXPORT_NODE':
      return { ...state, exportNode: action.payload };
    case 'SET_VIEW_TOGGLE_NODE':
      return { ...state, viewToggleNode: action.payload };
    case 'SET_SCHEDULE_ACTIONS_NODE':
      return { ...state, scheduleActionsNode: action.payload };
  }
}

/**
 * The sub bar slots a page fills through `PostsLayoutContext`: the period
 * navigation (`leading`), filters, the view dropdown, page actions and ghost
 * icon actions. A shell that owns a sub bar provides `contextValue` and renders
 * the returned nodes in its Container slots, so a page never puts its own
 * toolbar in the content.
 */
export function usePostsLayoutSlots() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const setExportNode = useCallback(
    (node: ReactNode) => dispatch({ payload: node, type: 'SET_EXPORT_NODE' }),
    [],
  );
  const setFiltersNode = useCallback(
    (node: ReactNode) => dispatch({ payload: node, type: 'SET_FILTERS_NODE' }),
    [],
  );
  const setLeadingNode = useCallback(
    (node: ReactNode) => dispatch({ payload: node, type: 'SET_LEADING_NODE' }),
    [],
  );
  const setIsRefreshing = useCallback(
    (value: boolean) => dispatch({ payload: value, type: 'SET_IS_REFRESHING' }),
    [],
  );
  const setRefresh = useCallback(
    (fn: RefreshFunction | (() => RefreshFunction)) =>
      dispatch({ payload: fn, type: 'SET_REFRESH_FN' }),
    [],
  );
  const setScheduleActionsNode = useCallback(
    (node: ReactNode) =>
      dispatch({ payload: node, type: 'SET_SCHEDULE_ACTIONS_NODE' }),
    [],
  );
  const setViewToggleNode = useCallback(
    (node: ReactNode) =>
      dispatch({ payload: node, type: 'SET_VIEW_TOGGLE_NODE' }),
    [],
  );

  const contextValue = useMemo(
    () => ({
      setExportNode,
      setFiltersNode,
      setIsRefreshing,
      setLeadingNode,
      setRefresh,
      setScheduleActionsNode,
      setViewToggleNode,
    }),
    [
      setExportNode,
      setFiltersNode,
      setIsRefreshing,
      setLeadingNode,
      setRefresh,
      setScheduleActionsNode,
      setViewToggleNode,
    ],
  );

  return { contextValue, slots: state };
}
