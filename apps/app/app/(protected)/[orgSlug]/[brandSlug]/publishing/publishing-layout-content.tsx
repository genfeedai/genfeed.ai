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
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  PublishingLayoutAction,
  PublishingLayoutState,
} from '@props/publishing/publishing-layout-content.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { LazyModalCreateThread, LazyModalPost } from '@ui/lazy/modal/LazyModal';
import { Button } from '@ui/primitives/button';
import { Dropdown } from '@ui/primitives/dropdown';
import { DropdownMenuItem } from '@ui/primitives/dropdown-menu';
import { Newspaper, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useMemo, useReducer } from 'react';
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
  const { push, refresh } = useRouter();
  const pathname = usePathname();
  const { href } = useOrgUrl();
  const { credentials } = useBrand();
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
    push(href(APP_ROUTES.PUBLISHING.POSTS_NEW));
  }, [href, push]);

  const handleNewXPost = useCallback(() => {
    push(`${href(APP_ROUTES.PUBLISHING.POSTS_NEW)}?platform=twitter`);
  }, [href, push]);

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
              <DropdownMenuItem onSelect={handleNewPost}>
                {translate('socialPost')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleNewXPost}>
                {translate('xPost')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openAgentComposer(
                    'Help me write a new long-form article for my brand.',
                  )
                }
              >
                {translate('article')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openAgentComposer(
                    'Help me write a new newsletter for my brand.',
                  )
                }
              >
                {translate('newsletter')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleNewLongPost}>
                {translate('xLongPost')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleNewThread}>
                {translate('xThread')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  openAgentComposer('Draft a social post for my brand.')
                }
              >
                {translate('askAgent')}
              </DropdownMenuItem>
            </Dropdown>
          </div>
        }
      >
        {children}
      </Container>
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
