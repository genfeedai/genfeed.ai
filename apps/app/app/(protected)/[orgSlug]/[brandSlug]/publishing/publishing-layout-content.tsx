'use client';

import {
  PostsLayoutContext,
  type RefreshFunction,
} from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
} from '@genfeedai/contracts/constants';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  PublishingLayoutAction,
  PublishingLayoutState,
} from '@props/publishing/publishing-layout-content.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import {
  LazyModalArticle,
  LazyModalNewsletter,
  LazyModalPost,
} from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Newspaper, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';

const initialPublishingLayoutState: PublishingLayoutState = {
  refreshFn: null,
  isRefreshing: false,
  filtersNode: null,
  leadingNode: null,
  exportNode: null,
  viewToggleNode: null,
  scheduleActionsNode: null,
};

function publishingLayoutReducer(
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

const NOOP_POSTS_LAYOUT_CONTEXT_VALUE = {
  setExportNode: () => {
    /* noop */
  },
  setFiltersNode: () => {
    /* noop */
  },
  setLeadingNode: () => {
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

function PublishingLayoutContentContent({ children }: { children: ReactNode }) {
  const { push, refresh } = useRouter();
  const pathname = usePathname();
  const { href } = useOrgUrl();
  const { credentials } = useBrand();
  const translate = useTranslations('pages.publishing.layout');

  const [state, dispatch] = useReducer(
    publishingLayoutReducer,
    initialPublishingLayoutState,
  );
  const {
    refreshFn,
    isRefreshing,
    filtersNode,
    leadingNode,
    exportNode,
    viewToggleNode,
    scheduleActionsNode,
  } = state;

  const pathSegments = (pathname ?? '').split('/').filter(Boolean);
  const publishingSegmentIndex = pathSegments.lastIndexOf('publishing');
  const routeSuffix =
    publishingSegmentIndex === -1
      ? []
      : pathSegments.slice(publishingSegmentIndex + 1);
  // Content desk and Campaigns own their controls.
  const hasOwnPageLayout =
    (routeSuffix[0] === 'posts' && routeSuffix.length === 2) ||
    routeSuffix[0] === 'campaigns';
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

  const handleNewPost = useCallback(() => {
    openModal(ModalEnum.POST_COMPOSE);
  }, []);

  const setExportNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_EXPORT_NODE', payload: node }),
    [],
  );
  const setFiltersNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_FILTERS_NODE', payload: node }),
    [],
  );
  const setLeadingNode = useCallback(
    (node: ReactNode) => dispatch({ type: 'SET_LEADING_NODE', payload: node }),
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
      setLeadingNode,
      setRefresh: setRefreshFn,
      setScheduleActionsNode,
      setViewToggleNode,
    }),
    // dispatch-wrapped callbacks are stable references (useCallback with [] deps)
    [
      setExportNode,
      setFiltersNode,
      setIsRefreshing,
      setLeadingNode,
      setRefreshFn,
      setScheduleActionsNode,
      setViewToggleNode,
    ],
  );

  if (hasOwnPageLayout) {
    return (
      <PostsLayoutContext.Provider value={NOOP_POSTS_LAYOUT_CONTEXT_VALUE}>
        {children}
      </PostsLayoutContext.Provider>
    );
  }

  return (
    <PostsLayoutContext.Provider value={mainContextValue}>
      <Container
        // Page-width container: the toolbar compacts when the inspector
        // narrows the page (see the `@…/publishing:` tiers below and in the
        // posts library toolbar) instead of wrapping onto a second row.
        className="@container/publishing"
        label={translate('title')}
        description={translate('description')}
        icon={Newspaper}
        titleVisibility="sr-only"
        leading={leadingNode}
        iconActions={
          <>
            {viewToggleNode}
            {exportNode}
            <ButtonRefresh
              onClick={handleRefresh}
              isRefreshing={isRefreshing}
            />
          </>
        }
        right={
          <div className="flex min-w-0 items-center justify-end gap-2">
            {filtersNode}
            {scheduleActionsNode}
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              className="shrink-0"
              ariaLabel={translate('newPost')}
              icon={<Plus className="size-4" />}
              label={
                <span className="hidden @[64rem]/publishing:inline">
                  {translate('newPost')}
                </span>
              }
              onClick={handleNewPost}
            />
          </div>
        }
      >
        {children}
      </Container>
      <LazyModalArticle
        onCreated={(ids) => {
          const id = Array.isArray(ids) ? ids[0] : ids;
          if (id) push(href(createArtifactEditorRoute('article', id)));
        }}
      />
      <LazyModalNewsletter
        onCreated={(id) => push(href(`${APP_ROUTES.EDIT.NEWSLETTER}/${id}`))}
      />
      <LazyModalPost
        isComposer
        credentials={credentials}
        modalId={ModalEnum.POST_COMPOSE}
        onConfirm={handleRefresh}
      />
    </PostsLayoutContext.Provider>
  );
}

export default function PublishingLayoutContent(
  props: Parameters<typeof PublishingLayoutContentContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PublishingLayoutContentContent {...props} />
    </Suspense>
  );
}
