'use client';

import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { OutlierPerformanceResponse } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  TableAction,
  TableColumn,
  TableRowSidebar,
} from '@props/ui/display/table.props';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Badge } from '@ui/primitives/badge';
import { ScanSearch, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import type { AnalyticsOutliersProps } from '@/features/analytics/props/analytics-outliers.props';
import { useOptionalDiscoveryRemix } from '@/features/research/remix/DiscoveryRemixProvider';
import OutlierBaselinePanel from './outlier-baseline-panel';

const PAGE_SIZE = 20;

function formatOutlierRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}x`;
}

export default function AnalyticsOutliers({
  brandId: propBrandId,
  platform,
  tier,
}: AnalyticsOutliersProps) {
  const scope = useCollectionScope();
  const brandId = propBrandId || scope.brandId;
  const { href } = useOrgUrl();
  const remix = useOptionalDiscoveryRemix();
  const translate = useTranslations('pages.analytics.outliers');
  const refreshTrigger = useOptionalAnalyticsContext()?.refreshTrigger ?? 0;
  const filterKey = [brandId, platform, tier].join('|');
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;

  // Primitives only: the scope object is a new reference every render.
  const isFetchReady = isCollectionFetchReady({ ...scope, brandId });

  const postsQuery = useAuthedQuery({
    enabled: isFetchReady,
    queryFn: async (service, signal) => {
      try {
        return await service.listPosts(
          {
            ...toBrandListParams({ brandId }),
            ...(platform ? { platform } : {}),
            ...(tier ? { tier } : {}),
            limit: PAGE_SIZE,
            page,
          },
          signal,
        );
      } catch (error) {
        logger.error('GET /outlier-baselines/posts failed', error);
        throw error;
      }
    },
    queryKey: [
      'outlier-baselines',
      'posts',
      scope.organizationId,
      brandId ?? null,
      platform ?? null,
      tier ?? null,
      page,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => OutlierBaselinesService.getInstance(token),
  });
  const posts = postsQuery.data?.docs;
  const total = postsQuery.data?.total ?? 0;
  // Skeleton only while nothing is cached for this page: a scope that is not
  // ready yet, or a first read in flight. A cached page paints at once.
  const isLoading = !isFetchReady || postsQuery.isLoading;

  const emptyLabel = translate('empty');

  const getPostHref = useCallback(
    (post: OutlierPerformanceResponse): string | undefined =>
      post.postId ? href(getPublishingPostHref(post.postId)) : undefined,
    [href],
  );

  const rowSidebar = useMemo<TableRowSidebar<OutlierPerformanceResponse>>(
    () => ({
      getId: (post) => post.id,
      getSubtitle: (post) => post.platform,
      getTitle: (post) => post.logicalPostId,
      kind: 'outlier',
      render: (post) => (
        <OutlierBaselinePanel openHref={getPostHref(post)} post={post} />
      ),
    }),
    [getPostHref],
  );

  const columns = useMemo<TableColumn<OutlierPerformanceResponse>[]>(
    () => [
      {
        className: 'min-w-40',
        header: translate('post'),
        key: 'logicalPostId',
        render: (post) => (
          <span className="font-semibold">{post.logicalPostId}</span>
        ),
      },
      {
        className: 'min-w-24',
        header: translate('platform'),
        key: 'platform',
        render: (post) => <PlatformBadge platform={post.platform} />,
      },
      {
        className: 'min-w-24',
        header: (
          <AnalyticsMetricLabel metric="views">
            {translate('views')}
          </AnalyticsMetricLabel>
        ),
        key: 'views',
        render: (post) =>
          post.views == null ? '-' : formatCompactNumber(post.views),
      },
      {
        className: 'min-w-28',
        header: translate('baseline'),
        key: 'medianViews',
        render: (post) =>
          post.medianViews == null
            ? '-'
            : `${formatCompactNumber(post.medianViews)} (${post.sampleSize ?? 0})`,
      },
      {
        className: 'min-w-24',
        header: translate('ratio'),
        key: 'outlierRatio',
        render: (post) => (
          <span className="font-semibold">
            {formatOutlierRatio(post.outlierRatio)}
          </span>
        ),
      },
      {
        className: 'min-w-24',
        header: translate('tier'),
        key: 'outlierTier',
        render: (post) =>
          post.outlierTier ? <Badge value={post.outlierTier} /> : '-',
      },
    ],
    [translate],
  );

  const actions = useMemo<TableAction<OutlierPerformanceResponse>[]>(
    () => [
      {
        href: (post) =>
          post.postId
            ? href(`${APP_ROUTES.ANALYTICS.HOOKS}?postId=${post.postId}`)
            : undefined,
        icon: <ScanSearch aria-hidden="true" />,
        tooltip: translate('analyzeHook'),
      },
      {
        icon: <Sparkles aria-hidden="true" />,
        isVisible: (post) =>
          Boolean(remix && (post.postId || post.sourcePostId)),
        onClick: (post) => {
          if (post.postId) {
            void remix?.openRemix({ kind: 'owned_post', postId: post.postId });
            return;
          }
          if (post.sourcePostId) {
            void remix?.openRemix({
              kind: 'source_post',
              sourcePostId: post.sourcePostId,
            });
          }
        },
        tooltip: translate('remix'),
      },
    ],
    [href, remix, translate],
  );

  return (
    <div className="space-y-4 pb-12">
      <Table<OutlierPerformanceResponse>
        label={translate('postsLabel')}
        items={posts ?? []}
        isLoading={isLoading}
        actions={actions}
        columns={columns}
        emptyLabel={emptyLabel}
        error={
          postsQuery.isError && !posts
            ? {
                onRetry: () => void postsQuery.refetch(),
                title: translate('loadError'),
              }
            : undefined
        }
        getRowKey={(post) => post.id}
        getRowLink={(post) => {
          const postHref = getPostHref(post);
          return postHref
            ? { href: postHref, label: post.logicalPostId }
            : undefined;
        }}
        rowSidebar={rowSidebar}
      />
      <Pagination
        currentPage={page}
        onPageChange={(nextPage) => setPageState({ filterKey, page: nextPage })}
        totalItems={total}
        totalLabel={translate('postsTotalLabel')}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      />
    </div>
  );
}
