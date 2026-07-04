'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { PostStatus } from '@genfeedai/enums';
import {
  getPublisherPostsHref,
  getPublisherPostsStatusFromPathname,
} from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';
import { HiOutlineNewspaper } from 'react-icons/hi2';

// Named sub-route segments that exist under /posts/ (not post-detail pages)
const KNOWN_SUB_ROUTES = [
  'analytics',
  'calendar',
  'newsletters',
  'published',
  'remix',
  'review',
  'scheduled',
];

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
      return { ...state, refreshFn: action.payload };
    case 'SET_IS_REFRESHING':
      return { ...state, isRefreshing: action.payload };
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

const NOOP_POSTS_LAYOUT_CONTEXT_VALUE = {
  setExportNode: () => {
    /* noop */
  },
  setFiltersNode: () => {
    /* noop */
  },
  setIsRefreshing: () => {
    /* noop */
  },
  setRefresh: () => {
    /* noop */
  },
  setScheduleActionsNode: () => {
    /* noop */
  },
  setViewToggleNode: () => {
    /* noop */
  },
};

function PostsLayoutContentContent({ children }: { children: ReactNode }) {
  const { refresh } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString() ?? '';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const { href } = useOrgUrl();

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

  const lastSegment = pathname?.split('/').pop();
  const isDetailRoute =
    pathname?.match(/^\/posts\/[^/]+$/) &&
    !KNOWN_SUB_ROUTES.includes(lastSegment ?? '');
  const statusFromPathname = getPublisherPostsStatusFromPathname(pathname);
  // Status is derived solely from the nested route path; the /posts index is
  // the Drafts view. Query `?status=` is no longer a navigation source.
  const activeStatus = statusFromPathname ?? PostStatus.DRAFT;
  const activeTab = useMemo(() => {
    return href(
      getPublisherPostsHref({
        platform: parsedSearchParams.get('platform'),
        status: activeStatus,
      }),
    );
  }, [activeStatus, href, parsedSearchParams]);
  const tabs = useMemo(
    () => [
      {
        href: href(
          getPublisherPostsHref({
            platform: parsedSearchParams.get('platform'),
          }),
        ),
        label: 'Drafts',
      },
      {
        href: href(
          getPublisherPostsHref({
            platform: parsedSearchParams.get('platform'),
            status: 'scheduled',
          }),
        ),
        label: 'Scheduled',
      },
      {
        href: href(
          getPublisherPostsHref({
            platform: parsedSearchParams.get('platform'),
            status: 'public',
          }),
        ),
        label: 'Published',
      },
    ],
    [href, parsedSearchParams],
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

  // Detail routes (e.g. /posts/abc123) skip the Container layout
  if (isDetailRoute) {
    return (
      <PostsLayoutContext.Provider value={NOOP_POSTS_LAYOUT_CONTEXT_VALUE}>
        {children}
      </PostsLayoutContext.Provider>
    );
  }

  return (
    <PostsLayoutContext.Provider value={mainContextValue}>
      <Container
        label="Posts"
        description="Manage and publish across platforms."
        icon={HiOutlineNewspaper}
        tabs={tabs}
        activeTab={activeTab}
        right={
          <div className="flex items-center gap-2">
            {viewToggleNode}
            {filtersNode}
            {exportNode}
            {scheduleActionsNode}
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </div>
        }
      >
        {children}
      </Container>
    </PostsLayoutContext.Provider>
  );
}

export default function PostsLayoutContent(
  props: Parameters<typeof PostsLayoutContentContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PostsLayoutContentContent {...props} />
    </Suspense>
  );
}
