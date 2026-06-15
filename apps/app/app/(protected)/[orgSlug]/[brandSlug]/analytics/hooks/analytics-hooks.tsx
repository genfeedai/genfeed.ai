'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { formatDuration } from '@genfeedai/helpers';
import type { IQueryParams } from '@genfeedai/interfaces';
import type {
  IViralHookAnalysis,
  IViralHookVideo,
} from '@genfeedai/interfaces/analytics/viral-hooks.interface';
import { formatDate } from '@helpers/formatting/date/date.helper';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { PLATFORM_CONFIGS_ARRAY as PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { format, subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiClock, HiOutlineVideoCamera } from 'react-icons/hi2';
import HookAnalysisSection from './HookAnalysisSection';
import HookStatCards from './HookStatCards';
import PlatformPerformanceSection from './PlatformPerformanceSection';

function formatTimeSpent(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

const createDefaultAnalysis = (): IViralHookAnalysis => ({
  avgTimePerVideo: 0,
  hookEffectiveness: [
    { avgEffectiveness: 0, count: 0, type: 'visual' },
    { avgEffectiveness: 0, count: 0, type: 'verbal' },
    { avgEffectiveness: 0, count: 0, type: 'narrative' },
    { avgEffectiveness: 0, count: 0, type: 'structural' },
  ],
  topHooks: [],
  topPlatforms: [],
  totalTime: 0,
  totalVideos: 0,
});

export interface AnalyticsHooksProps {
  brandId?: string;
}

export default function AnalyticsHooks({
  brandId: propBrandId,
}: AnalyticsHooksProps) {
  const { brandId: contextBrandId, organizationId } = useBrand();
  const brandId = propBrandId || contextBrandId;

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const [videos, setVideos] = useState<IViralHookVideo[] | null>(null);
  const [analysisData, setAnalysisData] = useState<IViralHookAnalysis>(() =>
    createDefaultAnalysis(),
  );

  const isLoading = videos === null;

  const fetchHookData = useCallback(async () => {
    setVideos(null);
    const url = 'GET /analytics/hooks';

    try {
      const service = await getAnalyticsService();
      const endDate = new Date();
      const startDate = subDays(endDate, 30);
      const query: IQueryParams = {
        endDate: format(endDate, 'yyyy-MM-dd'),
        startDate: format(startDate, 'yyyy-MM-dd'),
      };

      if (brandId) {
        query.brand = brandId;
      }

      const response = await service.getViralHooks(query);
      setVideos(response.videos ?? []);
      setAnalysisData(response.analysis ?? createDefaultAnalysis());
      logger.info(`${url} success`, response);
    } catch (error) {
      logger.error(`${url} failed`, error);
      setVideos([]);
      setAnalysisData(createDefaultAnalysis());
    }
  }, [brandId, getAnalyticsService]);

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    fetchHookData();
  }, [organizationId, fetchHookData]);

  const handleRefresh = () => {
    fetchHookData();
  };

  const aggregatedPlatformData = useMemo(() => {
    if (!videos?.length) {
      return [];
    }

    const platformMap = new Map<
      string,
      {
        totalViews: number;
        totalLikes: number;
        totalShares: number;
        totalComments: number;
        avgEngagement: number;
        avgViralScore: number;
        videoCount: number;
      }
    >();

    videos.forEach((video) => {
      video.platforms.forEach((platform) => {
        const existing = platformMap.get(platform.platform) || {
          avgEngagement: 0,
          avgViralScore: 0,
          totalComments: 0,
          totalLikes: 0,
          totalShares: 0,
          totalViews: 0,
          videoCount: 0,
        };

        existing.totalViews += platform.views;
        existing.totalLikes += platform.likes;
        existing.totalShares += platform.shares;
        existing.totalComments += platform.comments;
        existing.avgEngagement += platform.engagementRate;
        existing.avgViralScore += platform.viralScore;
        existing.videoCount += 1;

        platformMap.set(platform.platform, existing);
      });
    });

    return Array.from(platformMap.entries()).map(([platform, data]) => ({
      platform,
      ...data,
      avgEngagement: data.avgEngagement / data.videoCount,
      avgViralScore: data.avgViralScore / data.videoCount,
    }));
  }, [videos]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <Container
      label="Viral Hooks"
      description="Analyze hooks and engagement patterns."
      icon={HiOutlineVideoCamera}
    >
      <div className="flex justify-end gap-2 pb-4">
        <ButtonRefresh onClick={handleRefresh} isRefreshing={isLoading} />
      </div>

      <div className="space-y-8 pb-12">
        <HookStatCards
          analysisData={analysisData}
          formatTimeSpent={formatTimeSpent}
        />

        <PlatformPerformanceSection
          aggregatedPlatformData={aggregatedPlatformData}
        />

        <section>
          <Card className="border border-white/[0.08] bg-card/80">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">Video Hook Breakdown</h2>
              <Table<IViralHookVideo>
                items={videos ?? []}
                columns={[
                  {
                    className: 'min-w-64',
                    header: 'Video',
                    key: 'title',
                    render: (video) => (
                      <div className="space-y-1">
                        <p className="font-semibold line-clamp-1">
                          {video.title}
                        </p>
                        <p className="text-xs text-foreground/60">
                          {video.creator} • {formatDate(video.uploadDate)}
                        </p>
                      </div>
                    ),
                  },
                  {
                    className: 'w-24',
                    header: 'Duration',
                    key: 'duration',
                    render: (video) => (
                      <span className="text-sm">
                        {formatDuration(video.duration)}
                      </span>
                    ),
                  },
                  {
                    className: 'w-40',
                    header: 'Hooks',
                    key: 'hooks',
                    render: (video) => {
                      const hookCount = video.hooks.length;
                      const totalEffectiveness = video.hooks.reduce(
                        (acc, hook) => acc + hook.effectiveness,
                        0,
                      );
                      const averageEffectiveness =
                        hookCount > 0
                          ? Math.round(totalEffectiveness / hookCount)
                          : 0;

                      return (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-info text-info-foreground text-xs">
                            {hookCount} hooks
                          </Badge>
                          <span className="text-xs text-foreground/60">
                            Avg: {averageEffectiveness}% effective
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    className: 'w-32',
                    header: 'Platforms',
                    key: 'platforms',
                    render: (video) => (
                      <div className="flex gap-2">
                        {video.platforms.map((p) => {
                          const config = PLATFORM_CONFIGS.find(
                            (c) => c.id === p.platform,
                          );
                          const Icon = config?.icon;
                          return Icon ? (
                            <span
                              key={p.platform}
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
                    className: 'min-w-48',
                    header: 'Best Performance',
                    key: 'performance',
                    render: (video) => {
                      if (video.platforms.length === 0) {
                        return (
                          <p className="text-xs text-foreground/60">
                            No platform data
                          </p>
                        );
                      }

                      const best = video.platforms.reduce((prev, current) =>
                        current.viralScore > prev.viralScore ? current : prev,
                      );
                      const config = PLATFORM_CONFIGS.find(
                        (c) => c.id === best.platform,
                      );

                      return (
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{config?.label}</p>
                          <div className="flex gap-2 text-xs text-foreground/60">
                            <span>{formatCompactNumber(best.views)} views</span>
                            <span>•</span>
                            <span>Score: {best.viralScore}</span>
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    className: 'w-32',
                    header: 'Time Tracked',
                    key: 'timeTracked',
                    render: (video) => (
                      <div className="flex items-center gap-2">
                        <HiClock className="text-foreground/60" />
                        <span className="text-sm font-medium">
                          {formatTimeSpent(video.totalTimeTracked)}
                        </span>
                      </div>
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
