'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  createArtifactEditorRoute,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';
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
import type { TableColumn } from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Files } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

interface PublishingContentCollections {
  articles: Article[];
  newsletters: Newsletter[];
  posts: IPost[];
}

const EMPTY_COLLECTIONS: PublishingContentCollections = {
  articles: [],
  newsletters: [],
  posts: [],
};

export default function PublishingContentLibrary() {
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

      const [articlesService, newslettersService, postsService] =
        await Promise.all([
          getArticlesService(),
          getNewslettersService(),
          getPostsService(),
        ]);
      const collectionQuery = {
        ...toBrandListParams({ brandId }),
        organizationId: organizationId,
        sort: 'createdAt: -1',
      };

      const [articles, newsletters, posts] = await Promise.all([
        articlesService.findAllPages(collectionQuery, signal),
        newslettersService.findAllPages(collectionQuery, signal),
        postsService.findAllPages(collectionQuery, signal),
      ]);

      return { articles, newsletters, posts };
    },
    queryKey: ['publishing-content-library', organizationId, brandId],
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
      [...new Set(items.map((item) => item.channel))]
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
  const requestedStatus = parsedSearchParams.get('status') || 'all';
  const channel =
    requestedChannel === 'all' ||
    channelOptions.some((option) => option.value === requestedChannel)
      ? requestedChannel
      : 'all';
  const status =
    requestedStatus === 'all' ||
    statusOptions.some((option) => option.value === requestedStatus)
      ? requestedStatus
      : 'all';
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
    type !== 'all' || channel !== 'all' || status !== 'all' || Boolean(search);

  const replaceQueryParam = useCallback(
    (
      key: 'page' | 'platform' | 'search' | 'status' | 'type',
      value: string,
    ) => {
      const params = new URLSearchParams(searchParamsString);
      if (!value || value === 'all' || (key === 'page' && value === '1')) {
        params.delete(key);
      } else {
        params.set(key, value);
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
      const editorRoute = createArtifactEditorRoute(item.type, item.id);

      return {
        href: href(editorRoute),
        label: `Open ${item.title}`,
      };
    },
    [href],
  );

  const columns = useMemo<TableColumn<PublishingContentLibraryItem>[]>(
    () => [
      {
        header: 'Content',
        key: 'title',
        render: (item) => (
          <div className="max-w-xl">
            <p className="font-medium text-foreground">{item.title}</p>
            {item.summary ? (
              <p className="mt-1 line-clamp-1 text-sm text-foreground/55">
                {item.summary}
              </p>
            ) : null}
          </div>
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
        header: 'Channel',
        key: 'channel',
        render: (item) => formatPublishingContentChannel(item.channel),
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
        header: 'Created',
        key: 'createdAt',
        render: (item) => formatDate(item.createdAt),
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
    setViewToggleNode(null);
    setRefresh(() => async () => {
      await refetch();
    });

    return () => {
      setRefresh(() => () => {});
    };
  }, [refetch, setRefresh, setViewToggleNode]);

  useEffect(() => {
    setIsRefreshing(isFetching);
    return () => setIsRefreshing(false);
  }, [isFetching, setIsRefreshing]);

  const emptyState = error ? (
    <CardEmpty
      icon={Files}
      label="Content library unavailable"
      description="Refresh to try loading posts, articles, and newsletters again."
    />
  ) : (
    <CardEmpty
      icon={Files}
      label={hasActiveFilters ? 'No matching content' : 'No content yet'}
      description={
        hasActiveFilters
          ? 'Try a different type, channel, lifecycle status, or search.'
          : 'Posts, articles, and newsletters will appear here as you create them.'
      }
    />
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Content library
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            Social posts, articles, and newsletters across every lifecycle.
          </p>
        </div>
        <p className="text-sm tabular-nums text-foreground/55">
          {filteredItems.length.toLocaleString()}{' '}
          {filteredItems.length === 1 ? 'item' : 'items'}
        </p>
      </div>

      <AppTable<PublishingContentLibraryItem>
        actions={[]}
        columns={columns}
        emptyLabel="No content found"
        emptyState={emptyState}
        getRowKey={(item) => `${item.type}:${item.id}`}
        isLoading={isLoading}
        items={pageItems}
        getRowLink={getRowLink}
      />

      {totalPages > 1 ? (
        <div className="mt-4">
          <Pagination
            currentPage={visiblePage}
            totalPages={totalPages}
            onPageChange={(page) => replaceQueryParam('page', String(page))}
          />
        </div>
      ) : null}
    </div>
  );
}
