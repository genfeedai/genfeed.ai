'use client';

import { PostsLayoutContext } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  createArtifactEditorRoute,
  PUBLISHING_CONTENT_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Newspaper, Plus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useEffect } from 'react';
import {
  LazyModalArticle,
  LazyModalNewsletter,
  LazyModalPost,
} from '@/components/lazy/modal/LazyModal';
import { usePostsLayoutSlots } from '@/features/posts/hooks/use-posts-layout-slots/use-posts-layout-slots';

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

  const { contextValue: mainContextValue, slots } = usePostsLayoutSlots();
  const {
    refreshFn,
    isRefreshing,
    filtersNode,
    leadingNode,
    exportNode,
    viewToggleNode,
    scheduleActionsNode,
  } = slots;

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

  // Posts, releases or articles changed outside this page (the agent drafted
  // or scheduled one): the desk reloads through the refresh it registered.
  useEffect(() => {
    if (hasOwnPageLayout) {
      return;
    }

    window.addEventListener(PUBLISHING_CONTENT_REFRESH_EVENT, handleRefresh);
    return () =>
      window.removeEventListener(
        PUBLISHING_CONTENT_REFRESH_EVENT,
        handleRefresh,
      );
  }, [handleRefresh, hasOwnPageLayout]);

  const handleNewPost = useCallback(() => {
    openModal(ModalEnum.POST_COMPOSE);
  }, []);

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
        icon={Newspaper}
        titleVisibility="sr-only"
        leading={leadingNode}
        refresh={
          <ButtonRefresh onClick={handleRefresh} isRefreshing={isRefreshing} />
        }
        iconActions={exportNode}
        right={
          <div className="flex min-w-0 items-center justify-end gap-2">
            {filtersNode}
            {viewToggleNode}
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
        onCreated={(id) =>
          push(href(createArtifactEditorRoute('newsletter', id)))
        }
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
