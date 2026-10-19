'use client';

import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  OutlierPerformanceResponse,
  OutlierSnapshotResponse,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useOptionalDiscoveryRemix } from '@pages/research/remix/DiscoveryRemixProvider';
import type { AnalyticsOutliersProps } from '@props/analytics/analytics-outliers.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Badge from '@ui/display/badge/Badge';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import { ScanSearch, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import OutlierBaselineDrawer from './outlier-baseline-drawer';

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
  const getService = useAuthedService((token: string) =>
    OutlierBaselinesService.getInstance(token),
  );
  const refreshTrigger = useOptionalAnalyticsContext()?.refreshTrigger ?? 0;
  const filterKey = [brandId, platform, tier].join('|');
  const [pageState, setPageState] = useState({ filterKey, page: 1 });
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const [posts, setPosts] = useState<OutlierPerformanceResponse[] | null>(null);
  const [total, setTotal] = useState(0);
  const [isError, setIsError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [selected, setSelected] = useState<OutlierPerformanceResponse | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<OutlierSnapshotResponse | null>(
    null,
  );
  const [drawerPosts, setDrawerPosts] = useState<OutlierPerformanceResponse[]>(
    [],
  );
  const [isDrawerLoading, setIsDrawerLoading] = useState(false);

  // Primitives only: the scope object is a new reference every render, so
  // depending on it re-ran this effect on every render and never settled.
  const isFetchReady = isCollectionFetchReady({ ...scope, brandId });

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTrigger explicitly re-reads the page.
  useEffect(() => {
    if (!isFetchReady) {
      return;
    }
    const controller = new AbortController();
    setPosts(null);
    setIsError(false);
    void (async () => {
      try {
        const service = await getService();
        const result = await service.listPosts(
          {
            ...toBrandListParams({ brandId }),
            ...(platform ? { platform } : {}),
            ...(tier ? { tier } : {}),
            limit: PAGE_SIZE,
            page,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setPosts(result.docs);
        setTotal(result.total);
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('GET /outlier-baselines/posts failed', error);
        setPosts([]);
        setTotal(0);
        setIsError(true);
      }
    })();
    return () => controller.abort();
  }, [
    brandId,
    getService,
    isFetchReady,
    page,
    platform,
    refreshTrigger,
    retryCount,
    tier,
  ]);

  useEffect(() => {
    if (!selected) {
      setSnapshot(null);
      setDrawerPosts([]);
      return;
    }
    const controller = new AbortController();
    setIsDrawerLoading(true);
    void (async () => {
      try {
        const service = await getService();
        const [nextSnapshot, nextPosts] = await Promise.all([
          service.getSnapshot(selected.baselineSnapshotId, controller.signal),
          service.listSnapshotPosts(
            selected.baselineSnapshotId,
            { limit: 100 },
            controller.signal,
          ),
        ]);
        if (!controller.signal.aborted) {
          setSnapshot(nextSnapshot);
          setDrawerPosts(nextPosts);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        logger.error('GET /outlier-baselines/:id failed', error);
        setSnapshot(null);
        setDrawerPosts([]);
      } finally {
        if (!controller.signal.aborted) setIsDrawerLoading(false);
      }
    })();
    return () => controller.abort();
  }, [getService, selected]);

  const isInsufficient =
    posts !== null &&
    posts.length === 0 &&
    (snapshot?.status === 'insufficient_data' || false);
  const emptyLabel = isInsufficient
    ? translate('insufficient')
    : translate('empty');

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
          post.outlierTier ? (
            <Badge value={post.outlierTier} className="text-xs capitalize" />
          ) : (
            '-'
          ),
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
        isLoading={posts === null}
        actions={actions}
        columns={columns}
        emptyLabel={emptyLabel}
        error={
          isError
            ? {
                onRetry: () => setRetryCount((count) => count + 1),
                title: translate('loadError'),
              }
            : undefined
        }
        getRowKey={(post) => post.id}
        onRowClick={setSelected}
      />
      <Pagination
        currentPage={page}
        onPageChange={(nextPage) => setPageState({ filterKey, page: nextPage })}
        totalItems={total}
        totalLabel={translate('postsTotalLabel')}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      />
      <OutlierBaselineDrawer
        isOpen={selected !== null}
        isLoading={isDrawerLoading}
        posts={drawerPosts}
        snapshot={snapshot}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
