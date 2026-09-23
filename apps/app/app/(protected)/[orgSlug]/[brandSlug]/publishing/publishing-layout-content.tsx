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
} from '@genfeedai/contracts';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type {
  PublishingLayoutAction,
  PublishingLayoutState,
} from '@props/publishing/publishing-layout-content.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { LazyModalCreateThread, LazyModalPost } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { Newspaper, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer, useState } from 'react';
import { useOpenAgentComposer } from '@/hooks/use-open-agent-composer';

const initialPublishingLayoutState: PublishingLayoutState = {
  refreshFn: null,
  isRefreshing: false,
  filtersNode: null,
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

function PublishingLayoutContentContent({ children }: { children: ReactNode }) {
  const { refresh } = useRouter();
  const pathname = usePathname();
  const { credentials } = useBrand();
  const [creationPlatform, setCreationPlatform] =
    useState<CredentialPlatform>();
  const openAgentComposer = useOpenAgentComposer();
  const translate = useTranslations('pages.publishing.layout');

  const [state, dispatch] = useReducer(
    publishingLayoutReducer,
    initialPublishingLayoutState,
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
  const publishingSegmentIndex = pathSegments.lastIndexOf('publishing');
  const routeSuffix =
    publishingSegmentIndex === -1
      ? []
      : pathSegments.slice(publishingSegmentIndex + 1);
  // Content desk, Campaigns, and Calendar own their controls.
  const hasOwnPageLayout =
    (routeSuffix[0] === 'posts' && routeSuffix.length === 2) ||
    routeSuffix[0] === 'campaigns' ||
    routeSuffix[0] === 'calendar';
  const handleRefresh = useCallback(() => {
    if (typeof refreshFn === 'function') {
      refreshFn();
    } else {
      refresh();
    }
  }, [refreshFn, refresh]);

  const handleNewPost = useCallback(() => {
    setCreationPlatform(undefined);
    openModal(ModalEnum.POST);
  }, []);

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
        right={
          <div className="flex min-w-0 items-center justify-end gap-2">
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
                  className="shrink-0"
                  ariaLabel={translate('newPost')}
                  icon={<Plus className="size-4" />}
                  label={
                    <span className="hidden @[64rem]/publishing:inline">
                      {translate('newPost')}
                    </span>
                  }
                />
              }
            >
              <div className="flex flex-col gap-1 p-1">
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('socialPost')}
                  onClick={handleNewPost}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('xPost')}
                  onClick={() => {
                    setCreationPlatform(CredentialPlatform.TWITTER);
                    openModal(ModalEnum.POST);
                  }}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('article')}
                  onClick={() =>
                    openAgentComposer(
                      'Help me write a new long-form article for my brand.',
                    )
                  }
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('newsletter')}
                  onClick={() =>
                    openAgentComposer(
                      'Help me write a new newsletter for my brand.',
                    )
                  }
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('xLongPost')}
                  onClick={handleNewLongPost}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('xThread')}
                  onClick={handleNewThread}
                />
                <Button
                  withWrapper={false}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  className="w-full justify-start"
                  label={translate('askAgent')}
                  onClick={() =>
                    openAgentComposer('Draft a social post for my brand.')
                  }
                />
              </div>
            </Dropdown>
          </div>
        }
      >
        {children}
      </Container>
      <LazyModalPost
        key={creationPlatform ?? 'social'}
        credentials={creationPlatform ? xCredentials : credentials}
        defaultPlatform={creationPlatform}
        onConfirm={handleRefresh}
      />
      <LazyModalPost
        defaultPlatform={CredentialPlatform.TWITTER}
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

export default function PublishingLayoutContent(
  props: Parameters<typeof PublishingLayoutContentContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <PublishingLayoutContentContent {...props} />
    </Suspense>
  );
}
