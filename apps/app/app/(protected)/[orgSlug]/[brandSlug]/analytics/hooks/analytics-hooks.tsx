'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import type {
  IQueryParams,
  IViralHookAnalysis,
  IViralHookVideo,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AnalyticsHooksProps } from '@props/analytics/analytics-hooks.props';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { PLATFORM_CONFIGS_ARRAY as PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { format } from 'date-fns';
import { Video } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import HookAnalysisSection from './HookAnalysisSection';
import HookStatCards from './HookStatCards';
import PlatformPerformanceSection from './PlatformPerformanceSection';

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
  const { dateRange } = useAnalyticsContext();
  const searchParams = useSearchParams();
  const translateFilter = useTranslations('pages.analytics.hooksOutlierFilter');
  const brandId = propBrandId || contextBrandId;
  const postId = searchParams.get('postId')?.trim() || undefined;
  const [minOutlierTier, setMinOutlierTier] = useState<
    'all' | 'outlier' | 'breakout'
  >('all');

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
        if (minOutlierTier !== 'all') {
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

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    const controller = new AbortController();
    void fetchHookData(controller.signal);
    return () => controller.abort();
  }, [organizationId, fetchHookData]);

  const handleRefresh = () => {
    const controller = new AbortController();
    void fetchHookData(controller.signal);
  };

  return (
    <Container
      label="Viral Hooks"
      description="Analyze hooks and engagement patterns."
      icon={Video}
    >
      <div className="flex justify-end gap-2 pb-4">
        <Select
          value={minOutlierTier}
          onValueChange={(value) =>
            setMinOutlierTier(value as 'all' | 'outlier' | 'breakout')
          }
        >
          <SelectTrigger className="w-48" aria-label={translateFilter('label')}>
            <SelectValue placeholder={translateFilter('outliersFirst')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translateFilter('allPosts')}</SelectItem>
            <SelectItem value="outlier">
              {translateFilter('outliersFirst')}
            </SelectItem>
            <SelectItem value="breakout">
              {translateFilter('breakoutsOnly')}
            </SelectItem>
          </SelectContent>
        </Select>
        <ButtonRefresh onClick={handleRefresh} isRefreshing={isLoading} />
      </div>

      <div className="space-y-8 pb-12">
        <HookStatCards analysisData={analysisData} isLoading={isLoading} />

        <PlatformPerformanceSection topPlatforms={analysisData.topPlatforms} />

        <section>
          <Card>
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold tracking-tight">
                Post Hook Breakdown
              </h2>
              <Table<IViralHookVideo>
                items={videos ?? []}
                isLoading={isLoading}
                columns={[
                  {
                    className: 'min-w-48',
                    header: 'Post',
                    key: 'title',
                    render: (video) => (
                      <p className="font-semibold line-clamp-1">
                        {video.title}
                      </p>
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
                        {video.platforms.map((platform) => {
                          const config = PLATFORM_CONFIGS.find(
                            (c) => c.id === platform,
                          );
                          const Icon = config?.icon;
                          return Icon ? (
                            <span
                              key={platform}
                              role="img"
                              aria-label={config.label}
                              className="flex size-6 items-center justify-center bg-background/60"
                              style={{ color: config.color }}
                            >
                              <Icon className="text-sm" />
                            </span>
                          ) : null;
                        })}
                      </div>
                    ),
                  },
                  {
                    className: 'w-28',
                    header: 'Views',
                    key: 'totalViews',
                    render: (video) => (
                      <span className="text-sm font-medium">
                        {formatCompactNumber(video.totalViews)}
                      </span>
                    ),
                  },
                  {
                    className: 'w-28',
                    header: 'Engagement',
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
            </div>
          </Card>
        </section>

        <HookAnalysisSection analysisData={analysisData} />
      </div>
    </Container>
  );
}
