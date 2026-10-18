'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { Platform } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import PostsPlatformSelect from '@pages/posts/list/components/PostsPlatformSelect';
import type {
  PostsLayoutAction,
  PostsLayoutState,
} from '@props/admin/posts.props';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Newspaper } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';

const NOOP_POSTS_LAYOUT_CONTEXT_VALUE = {
  setExportNode: () => {},
  setFiltersNode: () => {},
  setLeadingNode: () => {},
  setIsRefreshing: () => {},
  setRefresh: () => {},
  setScheduleActionsNode: () => {},
  setViewToggleNode: () => {},
};

const initialPostsLayoutState: PostsLayoutState = {
  refreshFn: null,
  isRefreshing: false,
  filtersNode: null,
  leadingNode: null,
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
    case 'SET_LEADING_NODE':
      return state.leadingNode === action.payload
        ? state
        : { ...state, leadingNode: action.payload };
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
    leadingNode,
    exportNode,
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

  const handlePlatformChange = useCallback(
    (platform: string) => {
      if (platform === activeTab) {
        return;
      }

      const params = new URLSearchParams(searchParamsString);
      if (platform === 'all') {
        params.delete('platform');
      } else {
        params.set('platform', platform);
      }
      params.delete('page');
      const queryString = params.toString();
      push(
        queryString
          ? `${APP_ROUTES.ADMIN.CONTENT.POSTS}?${queryString}`
          : APP_ROUTES.ADMIN.CONTENT.POSTS,
      );
    },
    [push, activeTab, searchParamsString],
  );

  const handleRefresh = useCallback(() => {
    if (typeof refreshFn !== 'function') {
      refresh();
      return;
    }
    const result = refreshFn();
    if (typeof result === 'function') {
      void result();
    }
  }, [refreshFn, refresh]);

  const setExportNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_EXPORT_NODE', payload: node }),
    [],
  );
  const setLeadingNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_LEADING_NODE', payload: node }),
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
      setLeadingNode,
      setIsRefreshing,
      setRefresh: setRefreshFn,
      setScheduleActionsNode,
      setViewToggleNode,
    }),
    // dispatch-wrapped callbacks are stable references (useCallback with [] deps)
    [
      setExportNode,
      setFiltersNode,
      setLeadingNode,
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

  // Subbar order: refresh, download, dropdowns (organization first), CTA.
  return (
    <PostsLayoutContext.Provider value={mainContextValue}>
      <AdminPageShell
        title="Posts"
        icon={Newspaper}
        search={leadingNode}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        download={exportNode}
        dropdowns={
          isListRoute ? (
            <>
              <AdminOrgBrandUrlFilter />
              <PostsPlatformSelect
                value={activeTab}
                onChange={handlePlatformChange}
              />
              {filtersNode}
            </>
          ) : undefined
        }
        primaryAction={scheduleActionsNode}
      >
        {children}
      </AdminPageShell>
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
