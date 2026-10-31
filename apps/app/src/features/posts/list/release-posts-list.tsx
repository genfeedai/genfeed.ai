'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  PageScope,
  type PostCategory,
  type TargetExecutionState,
  TargetExecutionState as TargetState,
  ViewType,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  ITEMS_PER_PAGE,
  PUBLISHING_POSTS_QUERY_KEYS,
  type PublishingPostsViewMode,
  parsePublishingPostsViewMode,
} from '@genfeedai/contracts/constants';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import {
  getPublishingPostHref,
  normalizePostsPlatform,
} from '@helpers/content/posts.helper';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentProps } from '@props/layout/content.props';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Table from '@ui/display/table/Table';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ReleaseBoard from '@/features/posts/board/release-board';
import AccountGrid from '@/features/posts/grid/account-grid';
import { usePublishingPostsViewPreference } from '@/features/posts/hooks/use-publishing-posts-view-preference/use-publishing-posts-view-preference';
import PublishingContentIdentity from '@/features/posts/library/publishing-content-identity';
import PublishingViewToggle from '@/features/posts/library/publishing-view-toggle';
import { useRailKeys } from '@/features/posts/rail/hooks/use-rail-keys';
import ReleaseRailAccounts from '@/features/posts/rail/release-rail-accounts';
import { ReleaseRailActions } from '@/features/posts/rail/release-rail-row';
import {
  releaseContentPreview,
  releaseDisplayTitle,
  releaseNextInstant,
  releaseOutcomeSummary,
  visibleTargets,
} from '@/features/posts/rail/release-rail-row.helpers';
import ReleaseDetailDrawer, {
  RELEASE_RESCHEDULE_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from '@/features/posts/release/release-detail-drawer';
import { createReleaseMutationRunner } from '@/features/posts/release/release-mutation-runner';
import CapturedPostsList from './captured-posts-list';
import {
  CAPTURED_POSTS_SORT_OPTIONS,
  normalizeCapturedPostsSort,
} from './captured-posts-list-query';
import PostsListToolbar, {
  PostsListSearch,
} from './components/PostsListToolbar';
import { type PostsSourceFilter, parsePostsSource } from './posts-list-query';
import {
  buildReleasePostsListQueryKey,
  RELEASE_POSTS_SORT_OPTIONS,
  type ReleasePostsPublicationState,
  type ReleasePostsSort,
} from './release-posts-list-query';

type ReleaseListPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export interface ReleasePostsListProps extends ContentProps {
  campaignId?: string;
  contentTypes?: PostCategory[];
  credentialIds?: string[];
  executionStates?: TargetExecutionState[];
  initialPagination?: ReleaseListPagination;
  initialReleases?: IReleaseGroup[];
  platform?: string;
  publicationState?: ReleasePostsPublicationState;
  search: string;
  sort: ReleasePostsSort;
}

/** Wire format (`PublishingPostsViewMode`) to the `ViewToggle` UI enum. */
const VIEW_MODE_TO_VIEW_TYPE: Record<PublishingPostsViewMode, ViewType> = {
  board: ViewType.KANBAN,
  grid: ViewType.GRID,
  list: ViewType.LIST,
};

export default function ReleasePostsList({
  campaignId,
  contentTypes,
  credentialIds,
  executionStates,
  initialPagination,
  initialReleases,
  platform: platformParam,
  publicationState,
  scope,
  search,
  sort,
}: ReleasePostsListProps): React.JSX.Element {
  const translate = useTranslations('pages.posts.list');
  const translateRail = useTranslations('pages.posts.list.rail');
  const { brandId, isReady, organizationId } = useCollectionScope();
  const { href } = useOrgUrl();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? '';
  const source = parsePostsSource(searchParams?.get('source'));
  // Captured records are not releases; the Extension filter swaps the list.
  const isCapturedView = source !== undefined;
  const currentPage = Math.max(
    1,
    Number(new URLSearchParams(searchParamsString).get('page')) || 1,
  );
  const platform = normalizePostsPlatform(platformParam);
  const platformFilter = platform === 'all' ? undefined : platform;
  const { setLeadingNode, setRefresh, setViewToggleNode } = usePostsLayout();
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const viewMode = parsePublishingPostsViewMode(
    searchParams?.get(PUBLISHING_POSTS_QUERY_KEYS.VIEW),
  );
  const { getStoredView, storeView } =
    usePublishingPostsViewPreference(brandId);
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const queryClient = useQueryClient();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const queryKey = buildReleasePostsListQueryKey({
    brandId,
    campaignId,
    contentTypes,
    credentialIds,
    currentPage,
    executionStates,
    organizationId,
    platform: platformFilter,
    publicationState,
    scope,
    search,
    sort,
  });
  const initialData =
    initialPagination != null && initialReleases != null
      ? {
          pagination: initialPagination,
          releases: initialReleases,
        }
      : undefined;
  const emptyData = useMemo(
    () => ({
      pagination: {
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        total: 0,
        totalPages: 1,
      },
      releases: [] as IReleaseGroup[],
    }),
    [currentPage],
  );
  const {
    data = initialData ?? emptyData,
    error,
    isLoading,
    refetch,
  } = useQuery({
    enabled: isReady && !isCapturedView,
    initialData,
    queryFn: async () => {
      const service = await getReleaseGroupsService();
      const page = await service.findAllPage({
        ...((scope === PageScope.BRAND || scope === PageScope.PUBLISHING) &&
        brandId
          ? { brandId }
          : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(contentTypes?.length ? { contentType: contentTypes } : {}),
        ...(credentialIds?.length ? { credentialId: credentialIds } : {}),
        ...(executionStates?.length ? { executionState: executionStates } : {}),
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(platformFilter ? { platform: [platformFilter] } : {}),
        ...(publicationState ? { publicationState } : {}),
        ...(search ? { search } : {}),
        sort,
      });
      return {
        pagination: {
          page: page.page,
          pageSize: page.pageSize,
          total: page.total,
          totalPages: page.totalPages,
        },
        releases: page.items,
      };
    },
    queryKey,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const replaceSearchParams = useCallback(
    (update: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParamsString);
      update(params);
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParamsString],
  );

  /**
   * Same apply-or-surface-the-failure path the calendar page uses — only
   * `onSuccess` differs, since this list keeps its releases in the
   * react-query cache rather than local state.
   */
  const runMutation = useMemo(
    () =>
      createReleaseMutationRunner({
        getReleaseGroupsService,
        notificationsService,
        onSuccess: (updated) => {
          queryClient.setQueryData(queryKey, (current: typeof data) => {
            if (!current) {
              return current;
            }
            return {
              ...current,
              releases: current.releases.map((release) =>
                release.id === updated.id ? updated : release,
              ),
            };
          });
        },
        setDrawerError,
        setPendingAction,
      }),
    [getReleaseGroupsService, notificationsService, queryClient, queryKey],
  );

  // The name opens the primary target's post page; a release without targets
  // has no page of its own, so its row only opens the sidebar.
  const getReleasePostHref = useCallback(
    (release: IReleaseGroup): string | undefined => {
      const primaryTargetId = visibleTargets(release.targets).visible[0]?.id;
      return primaryTargetId
        ? href(getPublishingPostHref(primaryTargetId))
        : undefined;
    },
    [href],
  );

  const selectedReleaseId = searchParams?.get(
    PUBLISHING_POSTS_QUERY_KEYS.RELEASE,
  );
  const selectedRelease = useMemo(
    () =>
      data.releases.find((release) => release.id === selectedReleaseId) ?? null,
    [data.releases, selectedReleaseId],
  );

  const selectRelease = useCallback(
    (releaseId: string) => {
      replaceSearchParams((params) => {
        params.set(PUBLISHING_POSTS_QUERY_KEYS.RELEASE, releaseId);
      });
    },
    [replaceSearchParams],
  );

  const closeDrawer = useCallback(() => {
    setDrawerError(null);
    replaceSearchParams((params) => {
      params.delete(PUBLISHING_POSTS_QUERY_KEYS.RELEASE);
    });
  }, [replaceSearchParams]);

  const handleRescheduleRelease = useCallback(
    (scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }
      void runMutation(RELEASE_RESCHEDULE_ACTION, (service) =>
        service.update(selectedReleaseId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const handleRescheduleTarget = useCallback(
    (targetId: string, scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }
      void runMutation(targetRescheduleAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  /**
   * A manual retry is expressed as moving a failed target back to
   * `scheduled` — the API turns that transition into a fresh publish
   * attempt, mirroring the calendar page's retry handler.
   */
  const handleRetryTarget = useCallback(
    (targetId: string) => {
      if (!selectedReleaseId) {
        return;
      }
      void runMutation(targetRetryAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, {
          executionState: TargetState.SCHEDULED,
        }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const handleAccountToggle = useCallback(
    (credentialId: string) => {
      replaceSearchParams((params) => {
        const current = params.getAll(PUBLISHING_POSTS_QUERY_KEYS.ACCOUNT);
        const next = current.includes(credentialId)
          ? current.filter((value) => value !== credentialId)
          : [...current, credentialId];
        params.delete(PUBLISHING_POSTS_QUERY_KEYS.ACCOUNT);
        for (const value of next) {
          params.append(PUBLISHING_POSTS_QUERY_KEYS.ACCOUNT, value);
        }
        params.delete('page');
      });
    },
    [replaceSearchParams],
  );

  const handleViewModeChange = useCallback(
    (nextMode: PublishingPostsViewMode) => {
      storeView(nextMode);
      replaceSearchParams((params) => {
        // Approval queue state does not apply to the other Posts views.
        params.delete('run');
        params.delete('filter');
        params.delete('item');
        if (nextMode === 'list') {
          params.delete(PUBLISHING_POSTS_QUERY_KEYS.VIEW);
        } else {
          params.set(PUBLISHING_POSTS_QUERY_KEYS.VIEW, nextMode);
        }
      });
    },
    [replaceSearchParams, storeView],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per mount to seed the URL from the brand's last choice; the toggle and handleViewModeChange own every change after that.
  useEffect(() => {
    if (searchParams?.has(PUBLISHING_POSTS_QUERY_KEYS.VIEW)) {
      return;
    }
    const storedView = getStoredView();
    if (!storedView || storedView === 'list') {
      return;
    }
    replaceSearchParams((params) => {
      params.set(PUBLISHING_POSTS_QUERY_KEYS.VIEW, storedView);
    });
  }, []);

  const handleSearchChange = useCallback(
    (value: string) => {
      if (value === search) {
        return;
      }
      replaceSearchParams((params) => {
        if (value) {
          params.set('search', value);
        } else {
          params.delete('search');
        }
        params.delete('page');
      });
    },
    [replaceSearchParams, search],
  );

  const handleSourceChange = useCallback(
    (nextSource: PostsSourceFilter | undefined) => {
      replaceSearchParams((params) => {
        if (nextSource) {
          params.set('source', nextSource);
        } else {
          params.delete('source');
        }
        // A selected release and the page belong to the list being left.
        params.delete(PUBLISHING_POSTS_QUERY_KEYS.RELEASE);
        params.delete('page');
      });
    },
    [replaceSearchParams],
  );

  const handlePageChange = useCallback(
    (page: number) =>
      replaceSearchParams((params) => {
        if (page <= 1) params.delete('page');
        else params.set('page', String(page));
      }),
    [replaceSearchParams],
  );

  useEffect(() => {
    setLeadingNode(
      <PostsListSearch searchValue={search} onSearchChange={handleSearchChange}>
        <PostsListToolbar
          isAttached
          onSourceChange={handleSourceChange}
          sourceValue={source}
          onSortChange={(nextSort) =>
            replaceSearchParams((params) => {
              if (nextSort === 'createdAt: -1') {
                params.delete('sort');
              } else {
                params.set('sort', nextSort);
              }
              params.delete('page');
            })
          }
          sortOptions={
            isCapturedView
              ? CAPTURED_POSTS_SORT_OPTIONS
              : RELEASE_POSTS_SORT_OPTIONS
          }
          sortValue={isCapturedView ? normalizeCapturedPostsSort(sort) : sort}
        />
      </PostsListSearch>,
    );
    return () => {
      setLeadingNode(null);
    };
  }, [
    handleSearchChange,
    handleSourceChange,
    isCapturedView,
    replaceSearchParams,
    search,
    setLeadingNode,
    sort,
    source,
  ]);

  useEffect(() => {
    setViewToggleNode(
      <PublishingViewToggle
        activeView={VIEW_MODE_TO_VIEW_TYPE[viewMode]}
        onViewModeChange={handleViewModeChange}
      />,
    );
    // The captured list owns the refresh action.
    if (!isCapturedView)
      setRefresh(() => () => {
        void refetch();
      });
    return () => {
      if (!isCapturedView) setRefresh(() => () => {});
      setViewToggleNode(null);
    };
  }, [
    handleViewModeChange,
    isCapturedView,
    refetch,
    setRefresh,
    setViewToggleNode,
    viewMode,
  ]);

  useEffect(() => {
    if (
      isCapturedView ||
      isLoading ||
      data.pagination.totalPages < 1 ||
      currentPage <= data.pagination.totalPages
    ) {
      return;
    }
    replaceSearchParams((params) => {
      if (data.pagination.totalPages === 1) {
        params.delete('page');
      } else {
        params.set('page', String(data.pagination.totalPages));
      }
    });
  }, [
    currentPage,
    data.pagination.totalPages,
    isCapturedView,
    isLoading,
    replaceSearchParams,
  ]);

  useEffect(() => {
    if (error instanceof Error) {
      logger.error('GET /post-groups publish list failed', error);
    }
  }, [error]);

  const { activeIndex, registerItem, setActiveIndex } = useRailKeys({
    enabled: !isCapturedView,
    itemCount: data.releases.length,
    onOpen: (index) => {
      const release = data.releases[index];
      if (release) {
        selectRelease(release.id);
      }
    },
    onRefresh: () => void refetch(),
  });

  if (isCapturedView)
    return (
      <CapturedPostsList
        campaignId={campaignId}
        contentTypes={contentTypes}
        currentPage={currentPage}
        executionStates={executionStates}
        onPageChange={handlePageChange}
        platform={platformFilter}
        publicationState={publicationState}
        scope={scope}
        search={search}
        sort={sort}
      />
    );

  return (
    <div>
      <div className="mb-3 empty:hidden">
        <ReleaseRailAccounts
          brandId={brandId}
          onToggle={handleAccountToggle}
          selectedCredentialIds={credentialIds ?? []}
        />
      </div>

      {viewMode !== 'board' && error && data.releases.length > 0 ? (
        <ErrorFallback
          compact
          title={translate('loadError')}
          resetErrorBoundary={() => refetch()}
        />
      ) : null}
      {viewMode === 'board' ? (
        <ReleaseBoard
          browserTimezone={browserTimezone}
          isLoading={isLoading}
          loadError={Boolean(error)}
          onRefetch={() => void refetch()}
          releases={data.releases}
        />
      ) : error && data.releases.length === 0 ? (
        <ErrorFallback
          title={translate('loadError')}
          resetErrorBoundary={() => refetch()}
        />
      ) : viewMode === 'grid' ? (
        <AccountGrid
          brandId={brandId}
          browserTimezone={browserTimezone}
          isLoading={isLoading}
          onSelectRelease={selectRelease}
          reconnectHref={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}
          releases={data.releases}
          selectedCredentialIds={credentialIds ?? []}
        />
      ) : isLoading && data.releases.length === 0 ? (
        <Loading isFullSize={false} />
      ) : data.releases.length === 0 ? (
        <CardEmpty label={translate('empty.label')} />
      ) : (
        <Table
          items={data.releases}
          getRowKey={(release) => release.id}
          getRowClassName={(release) =>
            data.releases[activeIndex]?.id === release.id ? 'bg-accent' : ''
          }
          onRowClick={(release) => {
            setActiveIndex(
              data.releases.findIndex((item) => item.id === release.id),
            );
            selectRelease(release.id);
          }}
          columns={[
            {
              key: 'title',
              header: 'Content',
              render: (release) => (
                <div
                  ref={registerItem(data.releases.indexOf(release))}
                  data-release-id={release.id}
                >
                  <PublishingContentIdentity
                    channels={(Array.isArray(release.targets)
                      ? release.targets
                      : []
                    ).map((target) => target.platform)}
                    title={
                      releaseDisplayTitle(release) || translateRail('open')
                    }
                    summary={releaseContentPreview(release)}
                    titleHref={getReleasePostHref(release)}
                  />
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (release) => {
                const outcome = releaseOutcomeSummary(release);
                return (
                  <div className="flex flex-wrap gap-2 text-xs text-foreground/60">
                    {outcome.published > 0 ? (
                      <span>
                        {translateRail('outcome.published', {
                          count: outcome.published,
                        })}
                      </span>
                    ) : null}
                    {outcome.failed > 0 ? (
                      <span className="text-destructive">
                        {translateRail('outcome.failed', {
                          count: outcome.failed,
                        })}
                      </span>
                    ) : null}
                    {outcome.pending > 0 ? (
                      <span>
                        {translateRail('outcome.pending', {
                          count: outcome.pending,
                        })}
                      </span>
                    ) : null}
                  </div>
                );
              },
            },
            {
              key: 'scheduledDate',
              header: 'Scheduled',
              render: (release) => {
                const next = releaseNextInstant(release);
                return next
                  ? formatDateInTimezone(next, browserTimezone, 'short')
                  : '—';
              },
            },
          ]}
          renderRowActions={(release) => (
            <ReleaseRailActions release={release} />
          )}
        />
      )}

      <div className="mt-4">
        <Pagination
          currentPage={currentPage}
          totalItems={data.pagination.total}
          totalLabel="posts"
          onPageChange={handlePageChange}
          totalPages={data.pagination.totalPages}
        />
      </div>

      <ReleaseDetailDrawer
        brandId={brandId}
        error={drawerError}
        onClose={closeDrawer}
        onRescheduleRelease={handleRescheduleRelease}
        onRescheduleTarget={handleRescheduleTarget}
        onRetryTarget={handleRetryTarget}
        pendingAction={pendingAction}
        reconnectHref={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}
        release={selectedRelease}
      />
    </div>
  );
}
