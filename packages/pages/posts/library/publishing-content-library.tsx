'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  ButtonSize,
  ButtonVariant,
  PageScope,
  TargetExecutionState,
  ViewType,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
import {
  getPublishingPostHref,
  getPublishingReleaseHref,
} from '@helpers/content/posts.helper';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import PublishingContentIdentity from '@pages/posts/library/publishing-content-identity';
import {
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
  formatPublishingContentChannel,
  formatPublishingContentStatus,
  type PublishingContentLibraryItem,
  parsePublishingContentType,
} from '@pages/posts/library/publishing-content-library.helpers';
import PublishingContentLibraryToolbar from '@pages/posts/library/publishing-content-library-toolbar';
import PublishingPostHoverPreview from '@pages/posts/library/publishing-post-hover-preview';
import { needsPostAttention } from '@pages/posts/list/post-attention.helpers';
import ReleaseDetailDrawer from '@pages/posts/release/release-detail-drawer';
import { isTargetBlockedByReadiness } from '@pages/posts/shared/release-status.helpers';
import type { TableColumn } from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostsService } from '@services/content/posts.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { CalendarDays, Files, Kanban, LayoutGrid, Rows3 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildApprovalQueueHref } from './approval-queue-links.helpers';

interface PublishingContentCollections {
  articles: Article[];
  newsletters: Newsletter[];
  posts: IPost[];
  releases: IReleaseGroup[];
}

const EMPTY_COLLECTIONS: PublishingContentCollections = {
  articles: [],
  newsletters: [],
  posts: [],
  releases: [],
};

export default function PublishingContentLibrary({
  calendar,
}: {
  calendar?: React.ReactNode;
}) {
  const translate = useTranslations('pages.posts.list.collection');
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const isFetchReady = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });
  const { setFiltersNode, setIsRefreshing, setRefresh, setViewToggleNode } =
    usePostsLayout();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const view = new URLSearchParams(searchParamsString).get('view') || 'list';
  const isCalendar = Boolean(calendar) && view === 'calendar';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getArticlesService = useAuthedService(
    useCallback((token: string) => ArticlesService.getInstance(token), []),
  );
  const getNewslettersService = useAuthedService(
    useCallback((token: string) => NewslettersService.getInstance(token), []),
  );
  const getPostsService = useAuthedService(
    useCallback((token: string) => PostsService.getInstance(token), []),
  );

  const getReleasesService = useAuthedService(
    useCallback((token: string) => ReleaseGroupsService.getInstance(token), []),
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const {
    data: collections = EMPTY_COLLECTIONS,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useQuery<PublishingContentCollections>({
    enabled: isFetchReady,
    queryFn: async ({ signal }) => {
      if (!organizationId) {
        return EMPTY_COLLECTIONS;
      }

      const [
        articlesService,
        newslettersService,
        postsService,
        releasesService,
      ] = await Promise.all([
        getArticlesService(),
        getNewslettersService(),
        getPostsService(),
        getReleasesService(),
      ]);
      const collectionQuery = {
        ...toBrandListParams({ brandId }),
        organizationId: organizationId,
        sort: 'createdAt: -1',
      };

      const [articles, newsletters, posts, releases] = await Promise.all([
        articlesService.findAllPages(collectionQuery, signal),
        newslettersService.findAllPages(collectionQuery, signal),
        postsService.findAllPages(collectionQuery, signal),
        (async () => {
          const result: IReleaseGroup[] = [];
          let page = 1;
          while (!signal.aborted) {
            const batch = await releasesService.findAllPage(
              { ...(brandId ? { brandId } : {}), page, limit: 100 },
              signal,
            );
            result.push(...batch.items);
            if (!batch.hasNext) break;
            page += 1;
          }
          signal.throwIfAborted();
          return result;
        })(),
      ]);

      return { articles, newsletters, posts, releases };
    },
    queryKey: ['publishing-posts-library', organizationId, brandId],
  });

  useEffect(() => {
    if (!error) {
      return;
    }

    logger.error('Failed to load publishing content library', error);
    notificationsService.error('Failed to load content library');
  }, [error, notificationsService]);

  const items = useMemo(
    () => createPublishingContentLibraryItems(collections),
    [collections],
  );
  const postsById = useMemo(
    () => new Map(collections.posts.map((post) => [post.id, post])),
    [collections.posts],
  );
  const channelOptions = useMemo(
    () =>
      [...new Set(items.flatMap((item) => item.channels ?? [item.channel]))]
        .map((value) => ({
          label: formatPublishingContentChannel(value),
          value,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [items],
  );
  const statusOptions = useMemo(
    () =>
      [...new Set(items.map((item) => item.status))]
        .map((value) => ({
          label: formatPublishingContentStatus(value),
          value,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [items],
  );

  const requestedChannel = parsedSearchParams.get('platform') || 'all';
  const channel = requestedChannel;
  const status = useMemo(() => {
    const values = parsedSearchParams.getAll('status');
    const legacyValues = parsedSearchParams.getAll('executionState');
    const publication = parsedSearchParams.get('publicationState');
    const selected = values.length
      ? values
      : legacyValues.length
        ? legacyValues
        : publication === 'posted'
          ? ['published']
          : publication === 'not-posted'
            ? ['not-posted']
            : [];
    return selected
      .filter((value) => value !== 'all')
      .map((value) => (value === 'public' ? 'published' : value));
  }, [parsedSearchParams]);
  const type = parsePublishingContentType(parsedSearchParams.get('type'));
  const search = parsedSearchParams.get('search') || '';
  const requestedPage = Number.parseInt(
    parsedSearchParams.get('page') || '1',
    10,
  );
  const currentPage = Number.isFinite(requestedPage)
    ? Math.max(1, requestedPage)
    : 1;

  const filteredItems = useMemo(
    () =>
      filterPublishingContentLibraryItems(items, {
        channel,
        search,
        status,
        type,
      }),
    [channel, items, search, status, type],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / ITEMS_PER_PAGE),
  );
  const visiblePage = Math.min(currentPage, totalPages);
  const pageItems = filteredItems.slice(
    (visiblePage - 1) * ITEMS_PER_PAGE,
    visiblePage * ITEMS_PER_PAGE,
  );
  const hasActiveFilters =
    type !== 'all' || channel !== 'all' || status.length > 0 || Boolean(search);

  const replaceQueryParam = useCallback(
    (
      key:
        | 'page'
        | 'platform'
        | 'post'
        | 'search'
        | 'status'
        | 'type'
        | 'view'
        | 'release',
      value: string | string[],
    ) => {
      const params = new URLSearchParams(searchParamsString);
      params.delete(key);
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item && item !== 'all' && !(key === 'page' && item === '1'))
          params.append(key, item);
      }
      if (key === 'release') {
        params.delete('post');
      }
      if (key === 'post') {
        params.delete('release');
      }
      if (key === 'status') {
        params.delete('executionState');
        params.delete('publicationState');
      }
      if (key !== 'page') {
        params.delete('page');
      }

      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  const getDetailHref = useCallback(
    (item: PublishingContentLibraryItem) => {
      if (item.release) {
        return href(getPublishingReleaseHref(item.id));
      }
      if (item.type === 'post') {
        return href(getPublishingPostHref(item.id));
      }
      return href(createArtifactEditorRoute(item.type, item.id));
    },
    [href],
  );

  const openRowOverlay = useCallback(
    (item: PublishingContentLibraryItem) => {
      if (item.release) {
        replaceQueryParam('release', item.id);
        return;
      }
      if (item.type === 'post') {
        replaceQueryParam('post', item.id);
        return;
      }
      router.push(getDetailHref(item));
    },
    [getDetailHref, replaceQueryParam, router],
  );

  const selectedRelease =
    collections.releases?.find(
      (release) => release.id === parsedSearchParams.get('release'),
    ) ?? null;
  const mutateRelease = async (
    action: string,
    mutation: (service: ReleaseGroupsService) => Promise<unknown>,
  ) => {
    setPendingAction(action);
    setDrawerError(null);
    try {
      await mutation(await getReleasesService());
      await refetch();
    } catch (error) {
      setDrawerError(
        error instanceof Error
          ? error.message
          : 'The post could not be updated.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const attentionItems = filteredItems.filter(
    (item) =>
      item.type === 'post' &&
      (needsPostAttention(item.status, item.scheduledAt) ||
        item.release?.targets?.some(
          (target) =>
            target.executionState === TargetExecutionState.FAILED ||
            needsPostAttention(target.executionState, target.scheduledAt),
        )),
  );
  const retryItem = async (item: PublishingContentLibraryItem) => {
    setPendingAction(`retry:${item.id}`);
    try {
      if (item.release) {
        const service = await getReleasesService();
        const results = await Promise.allSettled(
          (item.release.targets ?? [])
            .filter(
              (target) =>
                target.executionState === TargetExecutionState.FAILED &&
                !isTargetBlockedByReadiness(target),
            )
            .map((target) =>
              service.updateTarget(item.id, target.id, {
                executionState: TargetExecutionState.SCHEDULED,
              }),
            ),
        );
        const failure = results.find((result) => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      } else {
        await (await getPostsService()).retry(item.id);
      }
    } catch (error) {
      notificationsService.error(translate('retryFailed'));
      logger.error('Failed to retry publishing item', error);
    } finally {
      try {
        await refetch();
      } finally {
        setPendingAction(null);
      }
    }
  };
  const renderPrimaryAction = (item: PublishingContentLibraryItem) => {
    const isFailed =
      item.type === 'post' &&
      (item.release
        ? item.release.targets?.some(
            (target) =>
              target.executionState === TargetExecutionState.FAILED &&
              !isTargetBlockedByReadiness(target),
          )
        : item.status === 'failed');
    return (
      <CollectionItemActions
        overflow={(item.release?.targets ?? []).flatMap((target) => [
          {
            id: `target:${target.id}`,
            label: translate('openTarget', { platform: target.platform }),
            href: href(getPublishingPostHref(target.id)),
          },
          ...(target.executionState === TargetExecutionState.PUBLISHED &&
          isSourcePostVariationPlatform(target.platform)
            ? [
                {
                  id: `variations:${target.id}`,
                  label: translate('variations', { platform: target.platform }),
                  href: href(
                    buildSourcePostVariationsHref({
                      platform: target.platform,
                      postId: target.id,
                    }),
                  ),
                },
              ]
            : []),
        ])}
        primary={
          <Button
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            isDisabled={pendingAction !== null}
            onClick={(event) => {
              event.stopPropagation();
              if (isFailed) void retryItem(item);
              else openRowOverlay(item);
            }}
          >
            {translate(isFailed ? 'retry' : 'open')}
          </Button>
        }
      />
    );
  };

  const columns: TableColumn<PublishingContentLibraryItem>[] = [
    {
      className: 'w-full md:w-auto',
      header: 'Content',
      key: 'title',
      render: (item) => (
        <PublishingPostHoverPreview
          post={postsById.get(item.id)}
          release={item.release}
        >
          <PublishingContentIdentity
            accounts={item.accounts}
            channels={item.channels ?? [item.channel]}
            format={item.format}
            title={item.title}
            summary={item.summary}
            titleHref={getDetailHref(item)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
            <Badge status={item.status}>
              {formatPublishingContentStatus(item.status)}
            </Badge>
            {item.scheduledAt ? (
              <span className="text-xs text-muted-foreground">
                {formatDate(item.scheduledAt)}
              </span>
            ) : null}
          </div>
        </PublishingPostHoverPreview>
      ),
    },
    {
      className: 'hidden md:table-cell',
      header: 'Status',
      key: 'status',
      render: (item) => (
        <Badge status={item.status}>
          {formatPublishingContentStatus(item.status)}
        </Badge>
      ),
    },
    {
      className: 'hidden md:table-cell',
      header: 'Scheduled',
      key: 'scheduledAt',
      render: (item) => (item.scheduledAt ? formatDate(item.scheduledAt) : '—'),
    },
    {
      className: 'hidden md:table-cell',
      header: 'Created',
      key: 'createdAt',
      render: (item) => formatDate(item.createdAt),
    },
    {
      header: <span className="sr-only">Actions</span>,
      key: 'actions',
      render: (item) => renderPrimaryAction(item),
    },
  ];

  useEffect(() => {
    setFiltersNode(
      <PublishingContentLibraryToolbar
        approvalQueueHref={href(buildApprovalQueueHref(searchParamsString))}
        channelOptions={channelOptions}
        channelValue={channel}
        searchValue={search}
        statusOptions={statusOptions}
        statusValue={status}
        typeValue={type}
        onChannelChange={(value) => replaceQueryParam('platform', value)}
        onSearchChange={(value) => replaceQueryParam('search', value)}
        onStatusChange={(value) => replaceQueryParam('status', value)}
        onTypeChange={(value) => replaceQueryParam('type', value)}
      />,
    );

    return () => setFiltersNode(null);
  }, [
    channel,
    channelOptions,
    href,
    replaceQueryParam,
    search,
    searchParamsString,
    setFiltersNode,
    status,
    statusOptions,
    type,
  ]);

  useEffect(() => {
    setViewToggleNode(
      <ViewToggle
        activeView={
          isCalendar
            ? ViewType.CALENDAR
            : view === 'board'
              ? ViewType.KANBAN
              : view === 'grid'
                ? ViewType.GRID
                : ViewType.LIST
        }
        onChange={(next) =>
          replaceQueryParam(
            'view',
            next === ViewType.CALENDAR
              ? 'calendar'
              : next === ViewType.KANBAN
                ? 'board'
                : next === ViewType.GRID
                  ? 'grid'
                  : 'list',
          )
        }
        options={[
          ...(calendar
            ? [
                {
                  type: ViewType.CALENDAR,
                  icon: <CalendarDays className="size-3.5" />,
                  label: 'Calendar view',
                },
              ]
            : []),
          {
            type: ViewType.LIST,
            icon: <Rows3 className="size-3.5" />,
            label: 'List',
          },
          {
            type: ViewType.KANBAN,
            icon: <Kanban className="size-3.5" />,
            label: 'Board',
          },
          {
            type: ViewType.GRID,
            icon: <LayoutGrid className="size-3.5" />,
            label: 'Grid',
          },
        ]}
      />,
    );
    if (!isCalendar)
      setRefresh(() => async () => {
        await refetch();
      });
    return () => {
      setViewToggleNode(null);
      if (!isCalendar) setRefresh(() => () => {});
    };
  }, [
    calendar,
    isCalendar,
    view,
    replaceQueryParam,
    refetch,
    setRefresh,
    setViewToggleNode,
  ]);

  useEffect(() => {
    setIsRefreshing(isFetching);
    return () => setIsRefreshing(false);
  }, [isFetching, setIsRefreshing]);

  const emptyState = error ? (
    <CardEmptyContent
      icon={Files}
      label="Posts unavailable"
      description="Refresh to try loading posts, articles, and newsletters again."
    />
  ) : (
    <CardEmptyContent
      icon={Files}
      label={hasActiveFilters ? 'No matching posts' : 'No posts yet'}
      description={
        hasActiveFilters
          ? 'Try a different type, channel, lifecycle status, or search.'
          : 'Posts, articles, and newsletters will appear here as you create them.'
      }
    />
  );

  if (isCalendar) return <>{calendar}</>;

  const renderPostCard = (item: PublishingContentLibraryItem) => (
    <div
      key={`${item.type}:${item.id}`}
      className="cursor-pointer"
      onClick={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest('a,button')
        ) {
          return;
        }
        openRowOverlay(item);
      }}
    >
      <Card>
        <PublishingPostHoverPreview
          post={postsById.get(item.id)}
          release={item.release}
        >
          <PublishingContentIdentity
            accounts={item.accounts}
            channels={item.channels ?? [item.channel]}
            format={item.format}
            title={item.title}
            summary={item.summary}
            titleHref={getDetailHref(item)}
          />
        </PublishingPostHoverPreview>
        <div className="flex items-center justify-between gap-2">
          <Badge status={item.status}>
            {formatPublishingContentStatus(item.status)}
          </Badge>
        </div>
        {renderPrimaryAction(item)}
      </Card>
    </div>
  );

  return (
    <div className="@container space-y-6">
      <CollectionSection
        title={translate('needsYou')}
        itemCount={attentionItems.length}
      >
        <AppTable<PublishingContentLibraryItem>
          actions={[]}
          columns={columns}
          items={attentionItems}
          getRowKey={(item) => `${item.type}:${item.id}`}
          onRowClick={openRowOverlay}
        />
      </CollectionSection>
      <CollectionSection title={translate('all')} isLoading={isLoading}>
        {filteredItems.length > 0 && (view === 'grid' || view === 'board') ? (
          view === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 @[40rem]:grid-cols-2 @[60rem]:grid-cols-3">
              {pageItems.map(renderPostCard)}
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto">
              {statusOptions
                .filter((option) =>
                  filteredItems.some((item) => item.status === option.value),
                )
                .map((option) => (
                  <section
                    key={option.value}
                    className="w-80 shrink-0 space-y-3"
                    aria-label={option.label}
                  >
                    <h2 className="flex items-center justify-between text-sm font-medium">
                      <span>{option.label}</span>
                      <span className="text-muted-foreground">
                        {
                          filteredItems.filter(
                            (item) => item.status === option.value,
                          ).length
                        }
                      </span>
                    </h2>
                    {filteredItems
                      .filter((item) => item.status === option.value)
                      .map(renderPostCard)}
                  </section>
                ))}
            </div>
          )
        ) : (
          <AppTable<PublishingContentLibraryItem>
            actions={[]}
            columns={columns}
            emptyLabel="No posts found"
            emptyState={emptyState}
            getRowKey={(item) => `${item.type}:${item.id}`}
            isLoading={isLoading}
            items={pageItems}
            onRowClick={openRowOverlay}
          />
        )}
      </CollectionSection>
      <div className="mt-4">
        <Pagination
          totalItems={filteredItems.length}
          totalLabel="posts"
          currentPage={visiblePage}
          totalPages={view === 'board' ? 1 : totalPages}
          onPageChange={(page) => replaceQueryParam('page', String(page))}
        />
      </div>
      <ReleaseDetailDrawer
        brandId={brandId}
        release={selectedRelease}
        error={drawerError}
        pendingAction={pendingAction}
        reconnectHref={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}
        onClose={() => replaceQueryParam('release', '')}
        onRescheduleRelease={(scheduledDate) => {
          if (selectedRelease)
            void mutateRelease('release:reschedule', (service) =>
              service.update(selectedRelease.id, { scheduledDate }),
            );
        }}
        onRescheduleTarget={(targetId, scheduledDate) => {
          if (selectedRelease)
            void mutateRelease(`target:reschedule:${targetId}`, (service) =>
              service.updateTarget(selectedRelease.id, targetId, {
                scheduledDate,
              }),
            );
        }}
        onResumeRelease={() => {
          if (selectedRelease)
            void mutateRelease('release:resume', (service) =>
              service.resume(selectedRelease.id),
            );
        }}
        onRetryTarget={(targetId) => {
          if (selectedRelease)
            void mutateRelease(`target:retry:${targetId}`, (service) =>
              service.updateTarget(selectedRelease.id, targetId, {
                executionState: TargetExecutionState.SCHEDULED,
              }),
            );
        }}
      />
      <PostDetailOverlay
        postId={parsedSearchParams.get('post')}
        scope={PageScope.PUBLISHING}
        onClose={() => replaceQueryParam('post', '')}
      />
    </div>
  );
}
