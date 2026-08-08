'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Newspaper, Plus } from 'lucide-react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';

// Named sub-route segments that exist under /publish/ (not post-detail pages).
// Campaigns / outreach live under Automate; keep legacy segment names only if a
// page still serves them (newsletters deep links, remix action deep link).
const KNOWN_SUB_ROUTES = [
  'analytics',
  'calendar',
  'newsletters',
  'overview',
  'published',
  'remix',
  'review',
  'scheduled',
];

const NEW_RELEASE_AGENT_HREF = buildAgentPromptHref(
  'Help me put together a new release — draft the posts and pick the channels to publish them on.',
);

type PublishLayoutState = {
  refreshFn: RefreshFunction | (() => RefreshFunction) | null;
  isRefreshing: boolean;
  filtersNode: ReactNode;
  exportNode: ReactNode;
  viewToggleNode: ReactNode;
  scheduleActionsNode: ReactNode;
};

type PublishLayoutAction =
  | {
      type: 'SET_REFRESH_FN';
      payload: RefreshFunction | (() => RefreshFunction) | null;
    }
  | { type: 'SET_IS_REFRESHING'; payload: boolean }
  | { type: 'SET_FILTERS_NODE'; payload: ReactNode }
  | { type: 'SET_EXPORT_NODE'; payload: ReactNode }
  | { type: 'SET_VIEW_TOGGLE_NODE'; payload: ReactNode }
  | { type: 'SET_SCHEDULE_ACTIONS_NODE'; payload: ReactNode };

const initialPublishLayoutState: PublishLayoutState = {
  refreshFn: null,
  isRefreshing: false,
  filtersNode: null,
  exportNode: null,
  viewToggleNode: null,
  scheduleActionsNode: null,
};

function publishLayoutReducer(
  state: PublishLayoutState,
  action: PublishLayoutAction,
): PublishLayoutState {
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

function PublishLayoutContentContent({ children }: { children: ReactNode }) {
  const { refresh } = useRouter();
  const pathname = usePathname();
  const { href } = useOrgUrl();

  const [state, dispatch] = useReducer(
    publishLayoutReducer,
    initialPublishLayoutState,
  );
  const {
    refreshFn,
    isRefreshing,
    filtersNode,
    exportNode,
    viewToggleNode,
    scheduleActionsNode,
  } = state;

  const pathSegments = (pathname ?? '').split('/').filter(Boolean);
  const publishSegmentIndex = pathSegments.lastIndexOf('publish');
  const routeSuffix =
    publishSegmentIndex === -1
      ? []
      : pathSegments.slice(publishSegmentIndex + 1);
  const lastSegment = routeSuffix[0];
  const isDetailRoute =
    routeSuffix.length === 1 && !KNOWN_SUB_ROUTES.includes(lastSegment ?? '');

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

  // Detail routes (e.g. /publish/abc123) skip the Container layout
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
        label="Publish"
        description="Manage and publish across platforms."
        icon={Newspaper}
        titleVisibility="sr-only"
        right={
          <div className="flex items-center gap-2">
            {filtersNode}
            {viewToggleNode}
            {exportNode}
            {scheduleActionsNode}
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <Link href={href(NEW_RELEASE_AGENT_HREF)}>
                <Plus className="size-4" />
                New release
              </Link>
            </Button>
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

export default function PublishLayoutContent(
  props: Parameters<typeof PublishLayoutContentContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PublishLayoutContentContent {...props} />
    </Suspense>
  );
}
