'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  APP_ROUTES,
  ITEMS_PER_PAGE,
  PUBLISHING_POSTS_QUERY_KEYS,
} from '@genfeedai/constants';
import {
  PageScope,
  type PostCategory,
  PostStatus,
  type TargetExecutionState,
  TargetExecutionState as TargetState,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import {
  getPublishingPostHref,
  normalizePostsPlatform,
} from '@helpers/content/posts.helper';
import { getBrowserTimezone } from '@helpers/formatting/timezone/timezone.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRailKeys } from '@pages/posts/rail/hooks/use-rail-keys';
import ReleaseRailAccounts from '@pages/posts/rail/release-rail-accounts';
import ReleaseRailRow from '@pages/posts/rail/release-rail-row';
import ReleaseRailSegments from '@pages/posts/rail/release-rail-segments';
import {
  applyRailSegment,
  type ReleaseRailSegment,
  railSegmentFromFilters,
} from '@pages/posts/rail/release-rail-segments.helpers';
import type { ContentProps } from '@props/layout/content.props';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Kbd } from '@ui/primitives/kbd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PostsListToolbar from './components/PostsListToolbar';
import type { PublishingPostsView } from './posts-list-query';
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

function viewMessageKey(
  view?: PublishingPostsView,
): 'all' | 'failed' | 'notPosted' | 'posted' {
  if (view === 'posted') {
    return 'posted';
  }
  if (view === 'failed') {
    return 'failed';
  }
  if (view === 'not-posted') {
    return 'notPosted';
  }
  return 'all';
}

function deriveRailSegment(
  publicationState: ReleasePostsPublicationState | undefined,
  executionStates: TargetExecutionState[] | undefined,
): ReleaseRailSegment {
  return railSegmentFromFilters({
    publicationState,
    status: executionStates?.includes(TargetState.FAILED)
      ? PostStatus.FAILED
      : executionStates?.includes(TargetState.SCHEDULED)
        ? PostStatus.SCHEDULED
        : executionStates?.includes(TargetState.PUBLISHING)
          ? PostStatus.PROCESSING
          : executionStates?.includes(TargetState.DRAFT)
            ? PostStatus.DRAFT
            : undefined,
  });
}

export default function ReleasePostsList({
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
  const currentPage = Math.max(
    1,
    Number(new URLSearchParams(searchParamsString).get('page')) || 1,
  );
  const platform = normalizePostsPlatform(platformParam);
  const platformFilter = platform === 'all' ? undefined : platform;
  const [toolbarSearchValue, setToolbarSearchValue] = useState(search);
  const { setFiltersNode, setRefresh, setViewToggleNode } = usePostsLayout();
  const browserTimezone = useMemo(() => getBrowserTimezone(), []);
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const queryKey = buildReleasePostsListQueryKey({
    brandId,
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
    enabled: isReady,
    initialData,
    queryFn: async () => {
      const service = await getReleaseGroupsService();
      const page = await service.findAllPage({
        ...((scope === PageScope.BRAND || scope === PageScope.PUBLISHING) &&
        brandId
          ? { brandId }
          : {}),
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
  const publishingView: PublishingPostsView | undefined =
    executionStates?.includes(TargetState.FAILED)
      ? PostStatus.FAILED
      : publicationState;
  const viewKey = viewMessageKey(publishingView);
  const railSegment = deriveRailSegment(publicationState, executionStates);
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

  const handleSegmentChange = useCallback(
    (segment: ReleaseRailSegment) => {
      const params = new URLSearchParams(searchParamsString);
      params.delete('page');
      const nextParams = applyRailSegment(params, segment);
      const queryString = nextParams.toString();
      const destination = queryString
        ? `${APP_ROUTES.PUBLISHING.POSTS}?${queryString}`
        : APP_ROUTES.PUBLISHING.POSTS;
      router.replace(href(destination), { scroll: false });
    },
    [href, router, searchParamsString],
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

  useEffect(() => {
    setToolbarSearchValue(search);
  }, [search]);

  useEffect(() => {
    if (toolbarSearchValue === search) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      replaceSearchParams((params) => {
        if (toolbarSearchValue) {
          params.set('search', toolbarSearchValue);
        } else {
          params.delete('search');
        }
        params.delete('page');
      });
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [replaceSearchParams, search, toolbarSearchValue]);

  useEffect(() => {
    setFiltersNode(
      <PostsListToolbar
        onSearchChange={setToolbarSearchValue}
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
        searchValue={toolbarSearchValue}
        sortOptions={RELEASE_POSTS_SORT_OPTIONS}
        sortValue={sort}
        viewNode={
          <ReleaseRailSegments
            onSegmentChange={handleSegmentChange}
            segment={railSegment}
          />
        }
      />,
    );
    return () => setFiltersNode(null);
  }, [
    handleSegmentChange,
    railSegment,
    replaceSearchParams,
    setFiltersNode,
    sort,
    toolbarSearchValue,
  ]);

  useEffect(() => {
    setViewToggleNode(null);
    setRefresh(() => () => {
      void refetch();
    });
    return () => {
      setRefresh(() => () => {});
      setViewToggleNode(null);
    };
  }, [refetch, setRefresh, setViewToggleNode]);

  useEffect(() => {
    if (
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
  }, [currentPage, data.pagination.totalPages, isLoading, replaceSearchParams]);

  useEffect(() => {
    if (error instanceof Error) {
      logger.error('GET /post-groups publish list failed', error);
    }
  }, [error]);

  const { activeIndex, registerItem, setActiveIndex } = useRailKeys({
    itemCount: data.releases.length,
    onOpen: (index) => {
      const release = data.releases[index];
      const targetId = release?.targets?.[0]?.id ?? release?.id;
      if (targetId) {
        router.push(href(getPublishingPostHref(targetId)));
      }
    },
    onRefresh: () => void refetch(),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {translate(`views.${viewKey}.title`)}
          </h2>
          <p className="mt-1 text-sm text-foreground/55">
            {translate(`views.${viewKey}.description`)}
          </p>
        </div>
        <p className="text-sm tabular-nums text-foreground/55">
          {translate('postCount', { count: data.pagination.total })}
        </p>
      </div>

      <div className="mb-3">
        <ReleaseRailAccounts
          brandId={brandId}
          onToggle={handleAccountToggle}
          selectedCredentialIds={credentialIds ?? []}
        />
      </div>

      {error ? (
        <p
          className="mb-4 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {translate('loadError')}
        </p>
      ) : null}

      {isLoading && data.releases.length === 0 ? (
        <Loading isFullSize={false} />
      ) : data.releases.length === 0 ? (
        <CardEmpty
          description={translate('empty.description')}
          label={translate('empty.label')}
        />
      ) : (
        <div className="flex flex-col" role="listbox">
          {data.releases.map((release, index) => (
            <ReleaseRailRow
              browserTimezone={browserTimezone}
              index={index}
              isActive={index === activeIndex}
              key={release.id}
              onActivate={() => setActiveIndex(index)}
              registerRow={registerItem(index)}
              release={release}
            />
          ))}
        </div>
      )}

      {data.releases.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-foreground/45">
          <span className="flex items-center gap-1">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd>
            {translateRail('keys.next')}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>Enter</Kbd>
            {translateRail('keys.open')}
          </span>
          <span className="flex items-center gap-1">
            <Kbd>r</Kbd>
            {translateRail('keys.refresh')}
          </span>
        </div>
      ) : null}

      {data.pagination.totalPages > 1 ? (
        <div className="mt-4">
          <Pagination
            currentPage={currentPage}
            onPageChange={(page) =>
              replaceSearchParams((params) => {
                if (page <= 1) {
                  params.delete('page');
                } else {
                  params.set('page', String(page));
                }
              })
            }
            totalPages={data.pagination.totalPages}
          />
        </div>
      ) : null}
    </div>
  );
}
