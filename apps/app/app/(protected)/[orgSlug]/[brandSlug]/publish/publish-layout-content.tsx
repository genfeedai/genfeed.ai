'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  CredentialPlatform,
  ModalEnum,
  PostFormat,
} from '@genfeedai/enums';
import { openModal } from '@helpers/ui/modal/modal.helper';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { LazyModalCreateThread, LazyModalPost } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { Newspaper, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';
import { useOpenAgentComposer } from '@/hooks/use-open-agent-composer';

function buildNewPostAgentPrompt(brandLabel?: string | null): string {
  const trimmedLabel = brandLabel?.trim();
  // Brand labels are user-supplied — quote via JSON.stringify so a `"` in the
  // name cannot break out of the clause and restructure the prompt.
  const brandClause = trimmedLabel
    ? `my brand ${JSON.stringify(trimmedLabel)} (already selected in the workspace — do not ask which brand to use)`
    : 'my currently selected brand (do not ask which brand to use)';

  return `Help me generate a new post for ${brandClause} — draft the content, pick the best channels, and prepare it for review or scheduling.`;
}

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
  const { credentials, selectedBrand } = useBrand();
  const openAgentComposer = useOpenAgentComposer();

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
  // Content desk (`/publish/posts/:id`) skips list chrome.
  const isDetailRoute = routeSuffix[0] === 'posts' && routeSuffix.length === 2;

  const handleRefresh = useCallback(() => {
    if (typeof refreshFn === 'function') {
      refreshFn();
    } else {
      refresh();
    }
  }, [refreshFn, refresh]);

  const handleNewPost = useCallback(() => {
    openAgentComposer(buildNewPostAgentPrompt(selectedBrand?.label));
  }, [openAgentComposer, selectedBrand?.label]);

  const xCredentials = useMemo(
    () =>
      credentials.filter(
        (credential) => credential.platform === CredentialPlatform.TWITTER,
      ),
    [credentials],
  );

  const handleNewLongPost = useCallback(() => {
    openModal(ModalEnum.POST_LONG_FORM);
  }, []);

  const handleNewThread = useCallback(() => {
    openModal(ModalEnum.THREAD_CREATE);
  }, []);

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
        label="Publishing"
        description="Manage and publish across platforms."
        icon={Newspaper}
        titleVisibility="sr-only"
        right={
          <div className="flex items-center gap-2">
            {filtersNode}
            {viewToggleNode}
            {exportNode}
            {scheduleActionsNode}
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
            <Dropdown
              minWidth="190px"
              trigger={
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                  icon={<Plus className="size-4" />}
                  label="New content"
                />
              }
            >
              <div className="flex flex-col gap-1 p-1">
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label="Post with Agent"
                  onClick={handleNewPost}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label="X long post"
                  onClick={handleNewLongPost}
                  isDisabled={xCredentials.length === 0}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label="X thread"
                  onClick={handleNewThread}
                  isDisabled={xCredentials.length === 0}
                />
              </div>
            </Dropdown>
          </div>
        }
      >
        {children}
      </Container>
      <LazyModalPost
        credentials={xCredentials}
        modalId={ModalEnum.POST_LONG_FORM}
        postFormat={PostFormat.LONG_FORM}
        onConfirm={handleRefresh}
      />
      <LazyModalCreateThread
        credentials={xCredentials}
        onConfirm={handleRefresh}
      />
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
