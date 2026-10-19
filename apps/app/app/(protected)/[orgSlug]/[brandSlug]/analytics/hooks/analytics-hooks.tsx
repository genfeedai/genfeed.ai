'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  useAnalyticsContext,
  useAnalyticsToolbar,
} from '@genfeedai/contexts/analytics/analytics-context';
import type {
  IQueryParams,
  IViralHookAnalysis,
  IViralHookVideo,
} from '@genfeedai/contracts/interfaces';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useClientPagination } from '@hooks/data/pagination/use-client-pagination/use-client-pagination';
import type { AnalyticsHooksProps } from '@props/analytics/analytics-hooks.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import AnalyticsFilterMenu from '@ui/analytics/analytics-filter-menu/AnalyticsFilterMenu';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import Table from '@ui/display/table/Table';
import Pagination from '@ui/navigation/pagination/Pagination';
import { format } from 'date-fns';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import HookAnalysisSection from './HookAnalysisSection';
import HookStatCards from './HookStatCards';
import PlatformPerformanceSection from './PlatformPerformanceSection';

const PAGE_SIZE = 10;
const EMPTY_VIDEOS: IViralHookVideo[] = [];
const OUTLIER_TIERS = ['outlier', 'breakout'] as const;

const createDefaultAnalysis = (): IViralHookAnalysis => ({
  hookEffectiveness: [],
  topHooks: [],
  topPlatforms: [],
  totalVideos: 0,
});

export default function AnalyticsHooks({
  brandId: propBrandId,
}: AnalyticsHooksProps) {
  const { brandId: contextBrandId, organizationId } = useBrand();
  const { dateRange, filters, refreshTrigger, setFilter } =
    useAnalyticsContext();
  const searchParams = useSearchParams();
  const translateFilter = useTranslations('pages.analytics.hooksOutlierFilter');
  const brandId = propBrandId || contextBrandId;
  const postId = searchParams.get('postId')?.trim() || undefined;
  const minOutlierTier = OUTLIER_TIERS.find((tier) => tier === filters.tier);

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [videos, setVideos] = useState<IViralHookVideo[] | null>(null);
  const [analysisData, setAnalysisData] = useState<IViralHookAnalysis>(() =>
    createDefaultAnalysis(),
  );

  const isLoading = videos === null;

  const fetchHookData = useCallback(
    async (signal: AbortSignal) => {
      setVideos(null);
      const url = 'GET /analytics/hooks';

      try {
        const service = await getAnalyticsService();
        const query: IQueryParams = {
          endDate: dateRange.endDate
            ? format(dateRange.endDate, 'yyyy-MM-dd')
            : undefined,
          startDate: dateRange.startDate
            ? format(dateRange.startDate, 'yyyy-MM-dd')
            : undefined,
        };

        if (brandId) {
          query.brand = brandId;
          query.brandId = brandId;
        }
        if (minOutlierTier) {
          query.minOutlierTier = minOutlierTier;
        }
        if (postId) {
          query.postId = postId;
        }

        const response = await service.getViralHooks(query);
        if (signal.aborted) return;
        setVideos(response.videos ?? []);
        setAnalysisData(response.analysis ?? createDefaultAnalysis());
        logger.info(`${url} success`, response);
      } catch (error) {
        if (signal.aborted) return;
        logger.error(`${url} failed`, error);
        setVideos([]);
        setAnalysisData(createDefaultAnalysis());
      }
    },
    [brandId, dateRange, getAnalyticsService, minOutlierTier, postId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshTrigger explicitly re-reads the hooks.
  useEffect(() => {
    if (!organizationId) {
      return;
    }
    const controller = new AbortController();
    void fetchHookData(controller.signal);
    return () => controller.abort();
  }, [organizationId, fetchHookData, refreshTrigger]);

  const toolbar = useMemo(() => {
    const facets: FilterMenuFacet[] = [
      {
        defaultValue: '',
        key: 'tier',
        label: translateFilter('label'),
        onChange: (value) => setFilter('tier', value || undefined),
        options: [
          { label: translateFilter('outliersFirst'), value: 'outlier' },
          { label: translateFilter('breakoutsOnly'), value: 'breakout' },
        ],
        selection: 'single',
        value: minOutlierTier ?? '',
      },
    ];
    return (
      <AnalyticsFilterMenu facets={facets} onClear={() => setFilter('tier')} />
    );
  }, [minOutlierTier, setFilter, translateFilter]);

  useAnalyticsToolbar(toolbar);

  const { currentPage, pageItems, setPage, totalPages } = useClientPagination(
    videos ?? EMPTY_VIDEOS,
    PAGE_SIZE,
  );

  return (
    <div>
      <div className="space-y-8 pb-12">
        <HookStatCards analysisData={analysisData} isLoading={isLoading} />

        <PlatformPerformanceSection topPlatforms={analysisData.topPlatforms} />

        <section className="space-y-4">
          <Table<IViralHookVideo>
            label="Post hook breakdown"
            items={pageItems}
            isLoading={isLoading}
            columns={[
              {
                className: 'min-w-48',
                header: 'Post',
                key: 'title',
                render: (video) => (
                  <p className="font-semibold line-clamp-1">{video.title}</p>
                ),
              },
              {
                className: 'min-w-64',
                header: 'Hook',
                key: 'hook',
                render: (video) =>
                  video.hook ? (
                    <p className="text-sm line-clamp-2">{video.hook}</p>
                  ) : (
                    <p className="text-xs text-foreground/60">
                      No hook detected
                    </p>
                  ),
              },
              {
                className: 'w-32',
                header: 'Platforms',
                key: 'platforms',
                render: (video) => (
                  <div className="flex gap-2">
                    {video.platforms.map((platform) => (
                      <PlatformBadge
                        key={platform}
                        platform={platform}
                        showLabel={false}
                      />
                    ))}
                  </div>
                ),
              },
              {
                className: 'w-28',
                header: (
                  <AnalyticsMetricLabel metric="views">
                    Views
                  </AnalyticsMetricLabel>
                ),
                key: 'totalViews',
                render: (video) => (
                  <span className="text-sm font-medium">
                    {formatCompactNumber(video.totalViews)}
                  </span>
                ),
              },
              {
                className: 'w-28',
                header: (
                  <AnalyticsMetricLabel metric="engagement">
                    Engagement
                  </AnalyticsMetricLabel>
                ),
                key: 'totalEngagement',
                render: (video) => (
                  <span className="text-sm font-medium">
                    {formatCompactNumber(video.totalEngagement)}
                  </span>
                ),
              },
            ]}
            getRowKey={(video) => video.id}
          />
          <Pagination
            currentPage={currentPage}
            onPageChange={setPage}
            totalItems={videos?.length ?? 0}
            totalLabel="posts"
            totalPages={totalPages}
          />
        </section>

        <HookAnalysisSection analysisData={analysisData} />
      </div>
    </div>
  );
}
