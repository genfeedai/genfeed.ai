'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import {
  APP_ROUTES,
  ITEMS_PER_PAGE,
  withArtifactEditorReturn,
} from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
  PageScope,
  type PostCategory,
  PostStatus,
  type TargetExecutionState,
  TargetExecutionState as TargetState,
} from '@genfeedai/enums';
import type { IReleaseGroup } from '@genfeedai/interfaces';
import {
  getPostsPlatformLabel,
  getPublishingPostHref,
  normalizePostsPlatform,
} from '@helpers/content/posts.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  formatDateInTimezone,
  getBrowserTimezone,
} from '@helpers/formatting/timezone/timezone.helper';
import { getPlatformIconComponent } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { ContentProps } from '@props/layout/content.props';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Loading from '@ui/loading/default/Loading';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Badge } from '@ui/primitives/badge';
import { buttonVariants } from '@ui/primitives/button.variants';
import {
  buildSourcePostVariationsHref,
  isSourcePostVariationPlatform,
} from '@utils/url/desktop-loop-url.util';
import { ExternalLink, Sparkles } from 'lucide-react';
import Link from 'next/link';
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
  executionStates?: TargetExecutionState[];
  initialPagination?: ReleaseListPagination;
  initialReleases?: IReleaseGroup[];
  platform?: string;
  publicationState?: ReleasePostsPublicationState;
  search: string;
  sort: ReleasePostsSort;
}

function statusVariant(
  status: string,
): 'destructive' | 'info' | 'secondary' | 'success' | 'warning' {
  switch (status) {
    case TargetState.PUBLISHED:
      return 'success';
    case TargetState.FAILED:
      return 'destructive';
    case TargetState.PUBLISHING:
    case TargetState.SCHEDULED:
      return 'info';
    case TargetState.PAUSED:
      return 'warning';
    default:
      return 'secondary';
  }
}

function releaseInstant(release: IReleaseGroup): string | null {
  const instants = [
    release.scheduledAt,
    ...(release.targets ?? []).map((target) => target.scheduledAt),
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return instants[0] ?? null;
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

export default function ReleasePostsList({
  contentTypes,
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
  const returnUrl = searchParamsString
    ? `${pathname}?${searchParamsString}`
    : pathname;

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

  const handlePublicationStateChange = useCallback(
    (nextView: PublishingPostsView) => {
      const params = new URLSearchParams(searchParamsString);
      params.delete('page');
      params.delete('status');
      const queryString = params.toString();
      const destination =
        nextView === 'failed'
          ? APP_ROUTES.PUBLISHING.FAILED
          : nextView === 'posted'
            ? APP_ROUTES.PUBLISHING.PUBLISHED
            : APP_ROUTES.PUBLISHING.SCHEDULED;
      router.replace(
        href(queryString ? `${destination}?${queryString}` : destination),
        { scroll: false },
      );
    },
    [href, router, searchParamsString],
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
        onPublishingViewChange={handlePublicationStateChange}
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
        publishingView={publishingView}
        searchValue={toolbarSearchValue}
        sortOptions={RELEASE_POSTS_SORT_OPTIONS}
        sortValue={sort}
      />,
    );
    return () => setFiltersNode(null);
  }, [
    handlePublicationStateChange,
    publishingView,
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.releases.map((release) => {
            const scheduledAt = releaseInstant(release);
            return (
              <article
                className="bg-card p-4 shadow-border transition-colors hover:bg-accent hover:shadow-border-strong"
                key={release.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                      {release.title || translate('untitled')}
                    </h3>
                    <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                      {release.baseContent || translate('noCopy')}
                    </p>
                  </div>
                  <Badge variant={statusVariant(release.status)}>
                    {formatEnumLabel(release.status)}
                  </Badge>
                </div>

                <div className="mt-4 space-y-2">
                  {(release.targets ?? []).map((target) => {
                    const PlatformIcon =
                      getPlatformIconComponent(target.platform) ?? ExternalLink;
                    const targetHref = withArtifactEditorReturn(
                      href(getPublishingPostHref(target.id)),
                      returnUrl,
                    );
                    return (
                      <div className="flex items-stretch gap-2" key={target.id}>
                        <Link
                          className={cn(
                            buttonVariants({
                              size: ButtonSize.SM,
                              variant: ButtonVariant.SECONDARY,
                            }),
                            'flex h-auto min-w-0 flex-1 justify-between gap-3 px-3 py-2 text-left',
                          )}
                          href={targetHref}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <PlatformIcon className="size-4 shrink-0" />
                            <span className="truncate">
                              {getPostsPlatformLabel(target.platform)}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {target.category ? (
                              <Badge variant="outline">
                                {formatEnumLabel(target.category)}
                              </Badge>
                            ) : null}
                            <Badge
                              variant={statusVariant(target.executionState)}
                            >
                              {formatEnumLabel(target.executionState)}
                            </Badge>
                          </span>
                        </Link>
                        {target.executionState === TargetState.PUBLISHED &&
                        isSourcePostVariationPlatform(target.platform) ? (
                          <Link
                            aria-label={translate('generateVariationsAria', {
                              platform: getPostsPlatformLabel(target.platform),
                            })}
                            className={buttonVariants({
                              size: ButtonSize.ICON,
                              variant: ButtonVariant.SECONDARY,
                            })}
                            href={href(
                              buildSourcePostVariationsHref({
                                platform: target.platform,
                                postId: target.id,
                              }),
                            )}
                          >
                            <Sparkles className="size-4" />
                          </Link>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-foreground/45">
                  <span>
                    {translate('channelCount', {
                      count: (release.targets ?? []).length,
                    })}
                  </span>
                  <span>
                    {scheduledAt
                      ? formatDateInTimezone(
                          scheduledAt,
                          browserTimezone,
                          'short',
                        )
                      : translate('unscheduled')}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

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
