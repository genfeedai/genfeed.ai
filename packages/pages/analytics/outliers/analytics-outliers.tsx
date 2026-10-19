'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { OutlierPerformanceResponse } from '@genfeedai/contracts/interfaces';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
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
import type {
  TableAction,
  TableColumn,
  TableRowSidebar,
} from '@props/ui/display/table.props';
import { OutlierBaselinesService } from '@services/analytics/outlier-baselines.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { ScanSearch, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import OutlierBaselinePanel from './outlier-baseline-panel';

const PLATFORM_VALUES = [
  'all',
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'facebook',
] as const;

const TIER_VALUES = ['all', 'outlier', 'breakout'] as const;

function formatOutlierRatio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}x`;
}

export default function AnalyticsOutliers({
  brandId: propBrandId,
}: AnalyticsOutliersProps) {
  const scope = useCollectionScope();
  const brandId = propBrandId || scope.brandId;
  const { href } = useOrgUrl();
  const remix = useOptionalDiscoveryRemix();
  const translate = useTranslations('pages.analytics.outliers');
  const getService = useAuthedService((token: string) =>
    OutlierBaselinesService.getInstance(token),
  );
  const [platform, setPlatform] = useState('all');
  const [tier, setTier] = useState('all');
  const [posts, setPosts] = useState<OutlierPerformanceResponse[] | null>(null);

  const fetchPosts = useCallback(
    async (signal: AbortSignal) => {
      if (!isCollectionFetchReady({ ...scope, brandId })) {
        return;
      }
      setPosts(null);
      try {
        const service = await getService();
        const result = await service.listPosts(
          {
            ...toBrandListParams({ brandId }),
            ...(platform !== 'all' ? { platform } : {}),
            ...(tier !== 'all' ? { tier: tier as 'outlier' | 'breakout' } : {}),
            limit: 50,
          },
          signal,
        );
        if (!signal.aborted) {
          setPosts(result.docs);
        }
      } catch (error) {
        if (signal.aborted) return;
        logger.error('GET /outlier-baselines/posts failed', error);
        setPosts([]);
      }
    },
    [brandId, getService, platform, scope, tier],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchPosts(controller.signal);
    return () => controller.abort();
  }, [fetchPosts]);

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
        render: (post) => post.platform,
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
          post.views == null ? '—' : formatCompactNumber(post.views),
      },
      {
        className: 'min-w-28',
        header: translate('baseline'),
        key: 'medianViews',
        render: (post) =>
          post.medianViews == null
            ? '—'
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
            '—'
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
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-2">
        <Heading size="xl">{translate('heading')}</Heading>
        <Text as="p" size="sm" color="subtle-60">
          {translate('description')}
        </Text>
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-44" aria-label={translate('platform')}>
            <SelectValue placeholder={translate('platform')} />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {translate(value === 'all' ? 'allPlatforms' : value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tier} onValueChange={setTier}>
          <SelectTrigger className="w-44" aria-label={translate('tier')}>
            <SelectValue placeholder={translate('tier')} />
          </SelectTrigger>
          <SelectContent>
            {TIER_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all'
                  ? translate('allTiers')
                  : value === 'outlier'
                    ? translate('outlierTier')
                    : translate('breakoutTier')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Table<OutlierPerformanceResponse>
        items={posts ?? []}
        isLoading={posts === null}
        actions={actions}
        columns={columns}
        emptyLabel={emptyLabel}
        getRowKey={(post) => post.id}
        getRowLink={(post) => {
          const postHref = getPostHref(post);
          return postHref
            ? { href: postHref, label: post.logicalPostId }
            : undefined;
        }}
        rowSidebar={rowSidebar}
      />
    </div>
  );
}
