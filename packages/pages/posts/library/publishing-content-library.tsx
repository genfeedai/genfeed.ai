'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { TargetExecutionState, ViewType } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPost, IReleaseGroup } from '@genfeedai/contracts/interfaces';
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
import PublishingContentIdentity from '@pages/posts/library/publishing-content-identity';
import {
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
  formatPublishingContentChannel,
  formatPublishingContentStatus,
  formatPublishingContentType,
  type PublishingContentLibraryItem,
  parsePublishingContentType,
} from '@pages/posts/library/publishing-content-library.helpers';
import PublishingContentLibraryToolbar from '@pages/posts/library/publishing-content-library-toolbar';
import { ReleaseRailActions } from '@pages/posts/rail/release-rail-row';
import ReleaseDetailDrawer from '@pages/posts/release/release-detail-drawer';
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
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { CalendarDays, Files, Kanban, LayoutGrid, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

  const getRowLink = useCallback(
    (item: PublishingContentLibraryItem) => {
      if (item.release) {
        const params = new URLSearchParams(searchParamsString);
        params.set('release', item.id);
        return { href: `${pathname}?${params}`, label: `Open ${item.title}` };
      }
      const editorRoute = createArtifactEditorRoute(item.type, item.id);

      return {
        href: href(editorRoute),
        label: `Open ${item.title}`,
      };
    },
    [href, pathname, searchParamsString],
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

  const columns = useMemo<TableColumn<PublishingContentLibraryItem>[]>(
    () => [
      {
        header: 'Content',
        key: 'title',
        render: (item) => (
          <PublishingContentIdentity
            channels={item.channels ?? [item.channel]}
            title={item.title}
            summary={item.summary}
          />
        ),
      },
      {
        header: 'Type',
        key: 'type',
        render: (item) => (
          <Badge>{formatPublishingContentType(item.type)}</Badge>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (item) => (
          <Badge status={item.status}>
            {formatPublishingContentStatus(item.status)}
          </Badge>
        ),
      },
      {
        header: 'Scheduled',
        key: 'scheduledAt',
        render: (item) =>
          item.scheduledAt ? formatDate(item.scheduledAt) : '—',
      },
      {
        header: 'Created',
        key: 'createdAt',
        render: (item) => formatDate(item.createdAt),
      },
      {
        header: <span className="sr-only">Actions</span>,
        key: 'actions',
        render: (item) =>
          item.release ? <ReleaseRailActions release={item.release} /> : null,
      },
    ],
    [],
  );

  useEffect(() => {
    setFiltersNode(
      <PublishingContentLibraryToolbar
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
    replaceQueryParam,
    search,
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
    <Link
      key={`${item.type}:${item.id}`}
      href={getRowLink(item).href}
      aria-label={`Open ${item.title}`}
    >
      <Card>
        <PublishingContentIdentity
          channels={item.channels ?? [item.channel]}
          title={item.title}
          summary={item.summary}
        />
        <div className="flex items-center justify-between gap-2">
          <Badge>{formatPublishingContentType(item.type)}</Badge>
          <Badge status={item.status}>
            {formatPublishingContentStatus(item.status)}
          </Badge>
        </div>
      </Card>
    </Link>
  );

  return (
    <div>
      {filteredItems.length > 0 && (view === 'grid' || view === 'board') ? (
        view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          getRowLink={getRowLink}
        />
      )}
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
        reconnectHref={href(APP_ROUTES.SETTINGS.SOCIAL)}
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
        onRetryTarget={(targetId) => {
          if (selectedRelease)
            void mutateRelease(`target:retry:${targetId}`, (service) =>
              service.updateTarget(selectedRelease.id, targetId, {
                executionState: TargetExecutionState.SCHEDULED,
              }),
            );
        }}
      />
    </div>
  );
}
