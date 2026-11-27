'use client';
import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
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
  normalizePostsPlatform,
} from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Article } from '@models/content/article.model';
import type { Newsletter } from '@models/content/newsletter.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostsService } from '@services/content/posts.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery } from '@tanstack/react-query';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import AppTable from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { Eye, Files, RotateCcw, Undo2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import PublishingContentBoard from '@/features/posts/library/publishing-content-board';
import PublishingContentCard from '@/features/posts/library/publishing-content-card';
import PublishingContentIdentity from '@/features/posts/library/publishing-content-identity';
import {
  createPublishingBoardColumns,
  createPublishingContentAccounts,
  createPublishingContentLibraryItems,
  filterPublishingContentLibraryItems,
  formatPublishingContentChannel,
  formatPublishingContentStatus,
  hasPublishingInFlight,
  IN_FLIGHT_REFETCH_MS,
  type PublishingContentLibraryItem,
  parsePublishingContentType,
} from '@/features/posts/library/publishing-content-library.helpers';
import PublishingContentLibraryToolbar, {
  PublishingContentLibrarySearch,
} from '@/features/posts/library/publishing-content-library-toolbar';
import PublishingContentStatus from '@/features/posts/library/publishing-content-status';
import PublishingPostHoverPreview from '@/features/posts/library/publishing-post-hover-preview';
import PublishingViewToggle from '@/features/posts/library/publishing-view-toggle';
import CapturedPostsList from '@/features/posts/list/captured-posts-list';
import { needsPostAttention } from '@/features/posts/list/post-attention.helpers';
import { parsePostsSource } from '@/features/posts/list/posts-list-query';
import { targetManualPostAction } from '@/features/posts/release/release-actions';
import ReleaseDetailDrawer from '@/features/posts/release/release-detail-drawer';
import {
  isTargetBlockedByReadiness,
  isTargetLive,
} from '@/features/posts/shared/release-status.helpers';

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

export default function PublishingContentLibrary() {
  const translate = useTranslations('pages.posts.list.collection');
  const emptyT = useTranslations('ui.emptyStates.posts');
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const { credentials } = useBrand();
  const isFetchReady = isCollectionFetchReady({
    brandId,
    isReady,
    organizationId,
    pageScope,
  });
  const { setLeadingNode, setIsRefreshing, setRefresh, setViewToggleNode } =
    usePostsLayout();
  const { href, activeHref } = useOrgUrl();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const view = new URLSearchParams(searchParamsString).get('view') || 'list';
  const parsedSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const source = parsePostsSource(parsedSearchParams.get('source'));
  // The Extension source lists captured posts, not releases or articles.
  const isCapturedView = source !== undefined;
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
    enabled: isFetchReady && !isCapturedView,
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
            const turboRun = await releasesService.findAllPage(
              { ...(brandId ? { brandId } : {}), page, limit: 100 },
              signal,
            );
            result.push(...turboRun.items);
            if (!turboRun.hasNext) break;
            page += 1;
          }
          signal.throwIfAborted();
          return result;
        })(),
      ]);

      return { articles, newsletters, posts, releases };
    },
    queryKey: ['publishing-posts-library', organizationId, brandId],
    refetchInterval: (query) =>
      query.state.data && hasPublishingInFlight(query.state.data)
        ? IN_FLIGHT_REFETCH_MS
        : false,
  });

  // use-effect-audit: ignore reports a load failure to the logger and notifications
  useEffect(() => {
    if (!error) {
      return;
    }

    logger.error('Failed to load publishing content library', error);
    notificationsService.error('Failed to load content library');
  }, [error, notificationsService]);

  const items = useMemo(
    () =>
      createPublishingContentLibraryItems({
        ...collections,
        credentials: credentials ?? [],
      }),
    [collections, credentials],
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
  const accountOptions = useMemo(
    () => createPublishingContentAccounts(credentials ?? []),
    [credentials],
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
    const publication = parsedSearchParams.get('publicationState');
    const selected = values.length
      ? values
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
  const isItemAttention = (item: PublishingContentLibraryItem) =>
    item.type === 'post' &&
    (needsPostAttention(item.status) ||
      Boolean(
        item.release?.targets?.some(
          (target) => target.executionState === TargetExecutionState.FAILED,
        ),
      ));
  // A status filter already narrows the list, so it is the only section then.
  const isAttentionSectionShown = status.length === 0;
  const attentionItems = isAttentionSectionShown
    ? filteredItems.filter(isItemAttention)
    : [];
  // A post shows once: failed posts sit in Needs you, everything else below.
  const listItems = isAttentionSectionShown
    ? filteredItems.filter((item) => !isItemAttention(item))
    : filteredItems;
  const totalPages = Math.max(1, Math.ceil(listItems.length / ITEMS_PER_PAGE));
  const visiblePage = Math.min(currentPage, totalPages);
  const pageItems = listItems.slice(
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
        | 'source'
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
      if (key === 'view') {
        // Approval queue state does not apply to the other Posts views.
        params.delete('run');
        params.delete('filter');
        params.delete('item');
      }
      if (key === 'status') {
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

  const clearFilters = useCallback(() => {
    const params = new URLSearchParams(searchParamsString);
    for (const key of [
      'page',
      'platform',
      'publicationState',
      'source',
      'status',
      'type',
    ]) {
      params.delete(key);
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [pathname, router, searchParamsString]);

  const getDetailHref = useCallback(
    (item: PublishingContentLibraryItem) => {
      // The title opens the editor; the row opens the drawer. A release has
      // no editor of its own, so its title opens its first channel's post.
      if (item.release) {
        const firstTargetId = Array.isArray(item.release.targets)
          ? item.release.targets[0]?.id
          : undefined;
        return href(
          firstTargetId
            ? getPublishingPostHref(firstTargetId)
            : getPublishingReleaseHref(item.id),
        );
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

  const activeRowId =
    parsedSearchParams.get('release') ?? parsedSearchParams.get('post');
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
  const isItemCancelled = (item: PublishingContentLibraryItem) =>
    item.type === 'post' &&
    Boolean(
      item.release?.targets?.some(
        (target) => target.executionState === TargetExecutionState.CANCELLED,
      ),
    );
  // Reopens the same release. It goes back on the calendar when its time is
  // still ahead, otherwise it comes back as a draft.
  const reopenItem = async (
    item: PublishingContentLibraryItem,
    mode: 'schedule' | 'draft',
  ) => {
    if (!item.release) return;
    const releaseId = item.release.id;
    const scheduledAt = item.release.scheduledAt ?? item.scheduledAt;
    const isFuture =
      Boolean(scheduledAt) && Date.parse(scheduledAt ?? '') > Date.now();
    setPendingAction(`reopen:${item.id}`);
    try {
      await (await getReleasesService()).reopen(
        releaseId,
        mode === 'schedule' && isFuture && scheduledAt
          ? scheduledAt
          : undefined,
      );
    } catch (error) {
      notificationsService.error(translate('reopenFailed'));
      logger.error('Failed to reopen publishing item', error);
    } finally {
      try {
        await refetch();
      } finally {
        setPendingAction(null);
      }
    }
  };
  const isItemFailed = (item: PublishingContentLibraryItem) =>
    item.type === 'post' &&
    Boolean(
      item.release
        ? item.release.targets?.some(
            (target) =>
              target.executionState === TargetExecutionState.FAILED &&
              !isTargetBlockedByReadiness(target),
          )
        : item.status === 'failed',
    );
  const getOverflowActions = (item: PublishingContentLibraryItem) => [
    ...(isItemCancelled(item)
      ? [
          {
            id: `reopen-draft:${item.id}`,
            label: translate('reopenAsDraft'),
            onSelect: () => {
              void reopenItem(item, 'draft');
            },
          },
        ]
      : []),
    ...(item.release?.targets ?? []).flatMap((target) => [
      {
        id: `target:${target.id}`,
        label: translate('openTarget', { platform: target.platform }),
        href: href(getPublishingPostHref(target.id)),
      },
      ...(isTargetLive(target) && isSourcePostVariationPlatform(target.platform)
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
    ]),
  ];
  const runPrimaryAction = (item: PublishingContentLibraryItem) => {
    if (isItemFailed(item)) void retryItem(item);
    else if (isItemCancelled(item) && item.release)
      void reopenItem(item, 'schedule');
    else openRowOverlay(item);
  };
  const getPrimaryLabelKey = (item: PublishingContentLibraryItem) =>
    isItemFailed(item)
      ? 'retry'
      : isItemCancelled(item) && item.release
        ? 'reopen'
        : 'open';

  // Card views keep a labelled primary action.
  const renderPrimaryAction = (item: PublishingContentLibraryItem) => (
    <CollectionItemActions
      overflow={getOverflowActions(item)}
      primary={
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          isDisabled={pendingAction !== null}
          onClick={(event) => {
            event.stopPropagation();
            runPrimaryAction(item);
          }}
        >
          {translate(getPrimaryLabelKey(item))}
        </Button>
      }
    />
  );

  // Table rows: icon-only actions revealed on row hover or keyboard focus.
  // The per-target overflow menu varies by row, so it goes through the table's
  // `renderRowActions` rather than the static `actions` prop.
  const renderRowActions = (item: PublishingContentLibraryItem) => {
    const primaryLabel = translate(getPrimaryLabelKey(item));
    return (
      <CollectionItemActions
        className="justify-end"
        overflow={getOverflowActions(item)}
        primary={
          <Button
            ariaLabel={primaryLabel}
            icon={
              isItemFailed(item) ? (
                <RotateCcw aria-hidden="true" />
              ) : getPrimaryLabelKey(item) === 'reopen' ? (
                <Undo2 aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )
            }
            isDisabled={pendingAction !== null}
            size={ButtonSize.ICON}
            tooltip={primaryLabel}
            tooltipPosition="left"
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={(event) => {
              event.stopPropagation();
              runPrimaryAction(item);
            }}
          />
        }
      />
    );
  };

  const columns: TableColumn<PublishingContentLibraryItem>[] = [
    {
      className: 'w-full md:w-auto',
      header: 'Content',
      key: 'title',
      sortable: false,
      render: (item) => (
        <PublishingPostHoverPreview
          post={postsById.get(item.id)}
          release={item.release}
        >
          <PublishingContentIdentity
            accounts={item.accounts}
            channels={item.channels ?? [item.channel]}
            format={item.format}
            media={item.media}
            title={item.title}
            summary={item.summary}
            titleHref={getDetailHref(item)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 md:hidden">
            <PublishingContentStatus
              isInboxDelivery={item.isInboxDelivery}
              publishedAt={item.publishedAt}
              scheduledAt={item.scheduledAt}
              status={item.status}
            />
          </div>
        </PublishingPostHoverPreview>
      ),
    },
    {
      className: 'hidden md:table-cell',
      header: 'Status',
      key: 'status',
      // One column: the badge says where the post is; hovering it says when
      // it went out or when it goes out.
      render: (item) => (
        <PublishingContentStatus
          isInboxDelivery={item.isInboxDelivery}
          publishedAt={item.publishedAt}
          scheduledAt={item.scheduledAt}
          status={item.status}
        />
      ),
    },
  ];

  // use-effect-audit: ignore registers the toolbar nodes with the page shell
  useEffect(() => {
    setLeadingNode(
      <PublishingContentLibrarySearch
        searchValue={search}
        onSearchChange={(value) => replaceQueryParam('search', value)}
      >
        <PublishingContentLibraryToolbar
          accountOptions={accountOptions}
          channelOptions={channelOptions}
          channelValue={channel}
          isAttached
          items={items}
          sourceValue={source}
          statusOptions={statusOptions}
          statusValue={status}
          typeValue={type}
          onChannelChange={(value) => replaceQueryParam('platform', value)}
          onClear={clearFilters}
          onSourceChange={(value) => replaceQueryParam('source', value ?? '')}
          onStatusChange={(value) => replaceQueryParam('status', value)}
          onTypeChange={(value) => replaceQueryParam('type', value)}
        />
      </PublishingContentLibrarySearch>,
    );

    return () => {
      setLeadingNode(null);
    };
  }, [
    accountOptions,
    channel,
    channelOptions,
    clearFilters,
    items,
    replaceQueryParam,
    search,
    setLeadingNode,
    source,
    status,
    statusOptions,
    type,
  ]);

  const refreshCapturedList = useCallback(async (): Promise<void> => {
    await refetch();
  }, [refetch]);

  // use-effect-audit: ignore registers the toolbar nodes with the page shell
  useEffect(() => {
    setViewToggleNode(
      <PublishingViewToggle
        activeView={
          view === 'board'
            ? ViewType.KANBAN
            : view === 'grid'
              ? ViewType.GRID
              : ViewType.LIST
        }
        onViewModeChange={(mode) => replaceQueryParam('view', mode)}
      />,
    );
    // The captured list owns the refresh action.
    if (!isCapturedView) setRefresh(() => refreshCapturedList);
    return () => {
      setViewToggleNode(null);
      if (!isCapturedView) setRefresh(() => () => {});
    };
  }, [
    isCapturedView,
    view,
    replaceQueryParam,
    refreshCapturedList,
    setRefresh,
    setViewToggleNode,
  ]);

  // use-effect-audit: ignore registers the page refresh handler with the shell
  useEffect(() => {
    setIsRefreshing(isFetching);
    return () => setIsRefreshing(false);
  }, [isFetching, setIsRefreshing]);

  const emptyConfig = error
    ? { icon: Files, title: emptyT('unavailableTitle') }
    : hasActiveFilters
      ? {
          action: { label: emptyT('clearFilters'), onClick: clearFilters },
          description: emptyT('filteredDescription'),
          icon: Files,
          title: emptyT('filteredTitle'),
        }
      : {
          description: emptyT('description'),
          icon: Files,
          title: emptyT('title'),
        };

  if (isCapturedView) {
    const capturedPlatform = normalizePostsPlatform(channel);
    return (
      <CapturedPostsList
        currentPage={currentPage}
        onPageChange={(page) => replaceQueryParam('page', String(page))}
        platform={capturedPlatform === 'all' ? undefined : capturedPlatform}
        scope={PageScope.PUBLISHING}
        search={search}
        sort="createdAt: -1"
      />
    );
  }

  const renderPostCard =
    (isStatusShown: boolean) => (item: PublishingContentLibraryItem) => (
      <PublishingContentCard
        key={`${item.type}:${item.id}`}
        actions={renderPrimaryAction(item)}
        isStatusShown={isStatusShown}
        item={item}
        titleHref={getDetailHref(item)}
        onOpen={openRowOverlay}
      />
    );

  return (
    <div className="@container space-y-6">
      {attentionItems.length > 0 ? (
        <CollectionSection
          title={translate('needsYou')}
          itemCount={attentionItems.length}
        >
          <AppTable<PublishingContentLibraryItem>
            columns={columns}
            items={attentionItems}
            renderRowActions={renderRowActions}
            getItemId={(item) => item.id}
            getRowKey={(item) => `${item.type}:${item.id}`}
            activeRowId={activeRowId}
            onRowClick={openRowOverlay}
          />
        </CollectionSection>
      ) : null}
      <CollectionSection isLoading={isLoading}>
        {listItems.length > 0 && (view === 'grid' || view === 'board') ? (
          view === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 @[40rem]:grid-cols-2 @[60rem]:grid-cols-3 @[80rem]:grid-cols-4">
              {pageItems.map(renderPostCard(true))}
            </div>
          ) : (
            <PublishingContentBoard
              columns={createPublishingBoardColumns(
                listItems,
                status.length > 0,
              )}
              renderCard={renderPostCard(false)}
            />
          )
        ) : (
          <AppTable<PublishingContentLibraryItem>
            columns={columns}
            emptyLabel={emptyT('title')}
            empty={emptyConfig}
            getItemId={(item) => item.id}
            getRowKey={(item) => `${item.type}:${item.id}`}
            activeRowId={activeRowId}
            isLoading={isLoading}
            items={pageItems}
            onRowClick={openRowOverlay}
            renderRowActions={renderRowActions}
          />
        )}
      </CollectionSection>
      <div className="mt-4">
        <Pagination
          totalItems={listItems.length}
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
        reconnectHref={activeHref(APP_ROUTES.SETTINGS.PROFILE)}
        onChangeCampaign={(campaignId) => {
          if (selectedRelease)
            void mutateRelease('release:campaign', (service) =>
              service.update(selectedRelease.id, { campaignId }),
            );
        }}
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
        onCompleteManualPost={(targetId, postUrl) => {
          if (selectedRelease)
            void mutateRelease(targetManualPostAction(targetId), (service) =>
              service.completeManualPost(selectedRelease.id, targetId, postUrl),
            );
        }}
        onSkipManualPost={(targetId) => {
          if (selectedRelease)
            void mutateRelease(targetManualPostAction(targetId), (service) =>
              service.skipManualPost(selectedRelease.id, targetId),
            );
        }}
      />
      <PostDetailPanel
        postId={parsedSearchParams.get('post')}
        scope={PageScope.PUBLISHING}
        onClose={() => replaceQueryParam('post', '')}
      />
    </div>
  );
}
