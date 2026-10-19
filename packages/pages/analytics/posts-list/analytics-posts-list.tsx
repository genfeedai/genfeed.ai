'use client';

import {
  useAnalyticsContext,
  useAnalyticsToolbar,
} from '@contexts/analytics/analytics-context';
import {
  AnalyticsMetric,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  PageScope,
} from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useTopPosts } from '@hooks/data/analytics/use-top-posts/use-top-posts';
import { useWinnerPosts } from '@hooks/data/analytics/use-winner-posts/use-winner-posts';
import { useClientPagination } from '@hooks/data/pagination/use-client-pagination/use-client-pagination';
import AnalyticsPostsGrid from '@pages/analytics/posts-list/analytics-posts-grid';
import AnalyticsWinnersTable from '@pages/analytics/posts-list/analytics-winners-table';
import PostDetailPanel from '@pages/posts/detail/PostDetailPanel';
import {
  POSTS_SOURCE_EXTENSION,
  parsePostsSource,
} from '@pages/posts/list/posts-list-query';
import type { AnalyticsPostGridItem } from '@props/analytics/analytics-posts-grid.props';
import AnalyticsFilterMenu from '@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { LayoutGrid } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

const METRIC_OPTIONS: Array<{
  label: string;
  value:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
}> = [
  { label: 'Views', value: AnalyticsMetric.VIEWS },
  { label: 'Engagement', value: AnalyticsMetric.ENGAGEMENT },
  { label: 'Likes', value: AnalyticsMetric.LIKES },
];

const PLATFORM_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'Facebook', value: 'facebook' },
] as const;

type PlatformFilterValue = (typeof PLATFORM_OPTIONS)[number]['value'];

const SHOW_ALL = 'all';
const SHOW_WINNERS = 'winners';
const SOURCE_ALL = 'all';
const POSTS_PAGE_SIZE = 12;

export default function AnalyticsPostsList() {
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const urlFocusedPostId = searchParams.get('postId')?.trim() || '';
  const [localFocusedPostId, setLocalFocusedPostId] = useState<
    string | null | undefined
  >(undefined);
  const { filters, setFilter } = useAnalyticsContext();
  const focusedPostId =
    (localFocusedPostId === undefined
      ? (filters.postId ?? urlFocusedPostId)
      : localFocusedPostId) ?? '';
  const search = filters.query ?? focusedPostId;
  const metric = (filters.metric ?? AnalyticsMetric.VIEWS) as
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.LIKES;
  const platform = (filters.platform ?? 'all') as PlatformFilterValue;
  const isWinnersView = filters.show === SHOW_WINNERS;
  // Winners have no source scope, so the filter only applies to all posts.
  const source = isWinnersView ? undefined : parsePostsSource(filters.source);
  const translateWinners = useTranslations('pages.analytics.winners');
  const translateSource = useTranslations('pages.analytics.sourceFilter');

  useEffect(() => {
    setLocalFocusedPostId(urlFocusedPostId || null);
  }, [urlFocusedPostId]);

  const setFocusedPost = useCallback(
    (postId?: string) => {
      setLocalFocusedPostId(postId ?? null);
      const nextSearchParams = new URLSearchParams(queryString);
      if (postId) {
        nextSearchParams.set('postId', postId);
      } else {
        nextSearchParams.delete('postId');
      }
      const query = nextSearchParams.toString();
      replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, replace, queryString],
  );

  const { isLoading, topPosts, error, refetch } = useTopPosts({
    limit: 50,
    metric,
    platform: platform === 'all' ? undefined : platform,
    source,
  });

  const winnerPosts = useWinnerPosts({
    isEnabled: isWinnersView,
    limit: 50,
    platform: platform === 'all' ? undefined : platform,
  });

  const rankedItems: AnalyticsPostGridItem[] = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return topPosts.reduce<AnalyticsPostGridItem[]>((acc, post, index) => {
      const label = post.label || stripHtmlToPlainText(post.description);
      if (
        normalizedSearch &&
        post.postId !== normalizedSearch &&
        !label.toLowerCase().includes(normalizedSearch) &&
        !(post.brandName || '').toLowerCase().includes(normalizedSearch) &&
        !post.platform.toLowerCase().includes(normalizedSearch)
      ) {
        return acc;
      }
      acc.push({
        brandName: post.brandName || 'Unknown brand',
        engagementRate: post.engagementRate || 0,
        ingredientUrl: post.ingredientUrl,
        isVideo: post.isVideo,
        label: label || 'Untitled Post',
        platform: post.platform,
        postId: post.postId,
        // Rank is the post's place in the sorted response, not in the search.
        rank: index + 1,
        thumbnailUrl: post.thumbnailUrl,
        totalEngagement: post.totalEngagement || 0,
        totalViews: post.totalViews || 0,
        visibility: post.visibility,
      });
      return acc;
    }, []);
  }, [search, topPosts]);

  const pagination = useClientPagination(rankedItems, {
    pageSize: POSTS_PAGE_SIZE,
    resetKey: [search, metric, platform, source ?? SOURCE_ALL].join('|'),
  });

  const toolbar = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: SHOW_ALL,
        key: 'show',
        label: translateWinners('showLabel'),
        onChange: (value) => {
          setFilter('show', value === SHOW_WINNERS ? value : undefined);
          if (value === SHOW_WINNERS) {
            setFilter('source', undefined);
          }
        },
        options: [
          { label: translateWinners('allPosts'), value: SHOW_ALL },
          { label: translateWinners('winners'), value: SHOW_WINNERS },
        ],
        selection: 'single',
        value: isWinnersView ? SHOW_WINNERS : SHOW_ALL,
      },
      ...(isWinnersView
        ? []
        : ([
            {
              defaultValue: AnalyticsMetric.VIEWS,
              // Rank by orders the posts, it does not narrow them.
              isCounted: false,
              key: 'metric',
              label: 'Rank by',
              onChange: (value) => setFilter('metric', value),
              options: METRIC_OPTIONS,
              selection: 'single',
              value: metric,
            },
          ] satisfies FilterMenuFacet[])),
      {
        defaultValue: 'all',
        key: 'platform',
        label: 'Platform',
        onChange: (value) =>
          setFilter('platform', value === 'all' ? undefined : value),
        options: PLATFORM_OPTIONS.map((option) => ({
          icon:
            option.value === 'all' ? (
              <LayoutGrid className="size-4 shrink-0 text-foreground/70" />
            ) : (
              getPlatformIcon(option.value, 'size-4 shrink-0')
            ),
          label: option.label,
          value: option.value,
        })),
        selection: 'single',
        value: platform,
      },
      ...(isWinnersView
        ? []
        : ([
            {
              defaultValue: SOURCE_ALL,
              key: 'source',
              label: translateSource('menuLabel'),
              onChange: (value) => setFilter('source', parsePostsSource(value)),
              options: [
                { label: translateSource('all'), value: SOURCE_ALL },
                {
                  label: translateSource('extension'),
                  value: POSTS_SOURCE_EXTENSION,
                },
              ],
              selection: 'single',
              value: source ?? SOURCE_ALL,
            },
          ] satisfies FilterMenuFacet[])),
    ];

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {focusedPostId ? (
          <Button
            label="Clear Focus"
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            onClick={() => setFocusedPost()}
          />
        ) : null}
        <FormSearchbar
          ariaLabel="Search posts"
          placeholder="Search posts..."
          value={search}
          onSearch={(value) => setFilter('query', value)}
          size={ComponentSize.SM}
          className="w-48"
        />

        <AnalyticsFilterMenu
          facets={facets}
          onClear={() => {
            setFilter('show', undefined);
            setFilter('platform', undefined);
            setFilter('source', undefined);
          }}
        />
      </div>
    );
  }, [
    focusedPostId,
    isWinnersView,
    search,
    metric,
    platform,
    setFocusedPost,
    setFilter,
    source,
    translateSource,
    translateWinners,
  ]);

  useAnalyticsToolbar(toolbar);

  return (
    <>
      {isWinnersView ? (
        <AnalyticsWinnersTable
          winners={winnerPosts.winners}
          search={search}
          isLoading={winnerPosts.isLoading}
          hasError={Boolean(winnerPosts.error)}
          onRetry={() => winnerPosts.refetch()}
          onSelectPost={setFocusedPost}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <AnalyticsPostsGrid
            items={pagination.pageItems}
            isLoading={isLoading}
            error={
              error
                ? {
                    title: 'Post analytics could not be loaded.',
                    onRetry: () => refetch(),
                  }
                : undefined
            }
            emptyLabel="No posts found for this period"
            hasAudience={Boolean(source)}
            onSelectPost={setFocusedPost}
          />
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={isLoading ? undefined : pagination.totalItems}
            totalLabel="posts"
            onPageChange={pagination.goToPage}
          />
        </div>
      )}

      <PostDetailPanel
        postId={focusedPostId || null}
        scope={PageScope.ANALYTICS}
        onClose={() => setFocusedPost()}
      />
    </>
  );
}
