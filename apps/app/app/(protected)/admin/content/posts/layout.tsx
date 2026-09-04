'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { Platform } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getPostPlatformTabs } from '@helpers/content/posts.helper';
import Container from '@ui/layout/container/Container';
import { Newspaper } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';

const NOOP_POSTS_LAYOUT_CONTEXT_VALUE = {
  setExportNode: () => {},
  setFiltersNode: () => {},
  setIsRefreshing: () => {},
  setRefresh: () => {},
  setScheduleActionsNode: () => {},
  setViewToggleNode: () => {},
};

type PostsLayoutState = {
  refreshFn: RefreshFunction | (() => RefreshFunction) | null;
  isRefreshing: boolean;
  filtersNode: ReactNode;
  exportNode: ReactNode;
  viewToggleNode: ReactNode;
  scheduleActionsNode: ReactNode;
};

type PostsLayoutAction =
  | {
      type: 'SET_REFRESH_FN';
      payload: RefreshFunction | (() => RefreshFunction) | null;
    }
  | { type: 'SET_IS_REFRESHING'; payload: boolean }
  | { type: 'SET_FILTERS_NODE'; payload: ReactNode }
  | { type: 'SET_EXPORT_NODE'; payload: ReactNode }
  | { type: 'SET_VIEW_TOGGLE_NODE'; payload: ReactNode }
  | { type: 'SET_SCHEDULE_ACTIONS_NODE'; payload: ReactNode };

const initialPostsLayoutState: PostsLayoutState = {
  refreshFn: null,
  isRefreshing: false,
  filtersNode: null,
  exportNode: null,
  viewToggleNode: null,
  scheduleActionsNode: null,
};

function postsLayoutReducer(
  state: PostsLayoutState,
  action: PostsLayoutAction,
): PostsLayoutState {
  switch (action.type) {
    case 'SET_REFRESH_FN':
      return state.refreshFn === action.payload
        ? state
        : { ...state, refreshFn: action.payload };
    case 'SET_IS_REFRESHING':
      return state.isRefreshing === action.payload
        ? state
        : { ...state, isRefreshing: action.payload };
    case 'SET_FILTERS_NODE':
      return state.filtersNode === action.payload
        ? state
        : { ...state, filtersNode: action.payload };
    case 'SET_EXPORT_NODE':
      return state.exportNode === action.payload
        ? state
        : { ...state, exportNode: action.payload };
    case 'SET_VIEW_TOGGLE_NODE':
      return state.viewToggleNode === action.payload
        ? state
        : { ...state, viewToggleNode: action.payload };
    case 'SET_SCHEDULE_ACTIONS_NODE':
      return state.scheduleActionsNode === action.payload
        ? state
        : { ...state, scheduleActionsNode: action.payload };
  }
}

function PostsLayoutContent({ children }: { children: ReactNode }) {
  const { push, refresh } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

  const [state, dispatch] = useReducer(
    postsLayoutReducer,
    initialPostsLayoutState,
  );
  const {
    refreshFn,
    isRefreshing,
    filtersNode,
    exportNode,
    viewToggleNode,
    scheduleActionsNode,
  } = state;

  const isListRoute = pathname === APP_ROUTES.ADMIN.CONTENT.POSTS;
  const isDetailRoute =
    pathname.startsWith(`${APP_ROUTES.ADMIN.CONTENT.POSTS}/`) &&
    pathname.split('/').length === 5;

  const platformParam = parsedSearchParams.get('platform');
  const activeTab =
    platformParam === Platform.YOUTUBE ||
    platformParam === Platform.INSTAGRAM ||
    platformParam === Platform.TWITTER ||
    platformParam === Platform.TIKTOK
      ? platformParam
      : 'all';

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === activeTab) {
        return;
      }

      if (tab === 'all') {
        push(APP_ROUTES.ADMIN.CONTENT.POSTS);
      } else {
        push(`${APP_ROUTES.ADMIN.CONTENT.POSTS}?platform=${tab}`);
      }
    },
    [push, activeTab],
  );

  const handleRefresh = useCallback(() => {
    if (typeof refreshFn === 'function') {
      refreshFn();
    } else {
      refresh();
    }
  }, [refreshFn, refresh]);

  const setExportNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_EXPORT_NODE', payload: node }),
    [],
  );
  const setFiltersNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_FILTERS_NODE', payload: node }),
    [],
  );
  const setIsRefreshing = useCallback(
    (value: boolean) => dispatch({ type: 'SET_IS_REFRESHING', payload: value }),
    [],
  );
  const setRefreshFn = useCallback(
    (fn: RefreshFunction | (() => RefreshFunction)) =>
      dispatch({ type: 'SET_REFRESH_FN', payload: fn }),
    [],
  );
  const setScheduleActionsNode = useCallback(
    (node: ReactNode) =>
      dispatch({ type: 'SET_SCHEDULE_ACTIONS_NODE', payload: node }),
    [],
  );
  const setViewToggleNode = useCallback(
    (node: ReactNode) =>
      dispatch({ type: 'SET_VIEW_TOGGLE_NODE', payload: node }),
    [],
  );

  const mainContextValue = useMemo(
    () => ({
      setExportNode,
      setFiltersNode,
      setIsRefreshing,
      setRefresh: setRefreshFn,
      setScheduleActionsNode,
      setViewToggleNode,
    }),
    // dispatch-wrapped callbacks are stable references (useCallback with [] deps)
    [
      setExportNode,
      setFiltersNode,
      setIsRefreshing,
      setRefreshFn,
      setScheduleActionsNode,
      setViewToggleNode,
    ],
  );

  if (isDetailRoute) {
    return (
      <PostsLayoutContext.Provider value={NOOP_POSTS_LAYOUT_CONTEXT_VALUE}>
        {children}
      </PostsLayoutContext.Provider>
    );
  }

  const listActions = (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      {viewToggleNode}
      {filtersNode}
      {exportNode}
      {scheduleActionsNode}
      <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
    </div>
  );

  return (
    <PostsLayoutContext.Provider value={mainContextValue}>
      <Container
        label="Posts"
        description="View and manage published content across all connected accounts"
        icon={Newspaper}
        titleVisibility="sr-only"
        headerTabs={
          isListRoute
            ? {
                activeTab,
                fullWidth: false,
                onTabChange: handleTabChange,
                tabs: getPostPlatformTabs(),
              }
            : undefined
        }
        right={listActions}
      >
        {children}
      </Container>
    </PostsLayoutContext.Provider>
  );
}

export default function PostsLayout(
  props: Parameters<typeof PostsLayoutContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PostsLayoutContent {...props} />
    </Suspense>
  );
}
