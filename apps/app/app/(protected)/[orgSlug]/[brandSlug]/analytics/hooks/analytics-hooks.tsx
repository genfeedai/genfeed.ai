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
import StatCard from '@ui/cards/stat-card/StatCard';
import Badge from '@ui/display/badge/Badge';
import MetricItem from '@ui/display/metric-item/MetricItem';
import Table from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { PLATFORM_CONFIGS_ARRAY as PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import { format, subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiTrendingUp } from 'react-icons/hi';
import { HiClock, HiEye, HiHeart, HiOutlineVideoCamera } from 'react-icons/hi2';

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
  const [isLoading, setIsLoading] = useState(true);
  const [videos, setVideos] = useState<IViralHookVideo[]>([]);
  const [analysisData, setAnalysisData] = useState<IViralHookAnalysis>(
    createDefaultAnalysis(),
  );

  const fetchHookData = useCallback(async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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

  const formatTimeSpent = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const aggregatedPlatformData = useMemo(() => {
    if (!videos.length) {
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
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={HiEye}
            label="Total Videos Analyzed"
            value={analysisData.totalVideos}
          />
          <StatCard
            icon={HiClock}
            label="Total Time Tracked"
            value={formatTimeSpent(analysisData.totalTime)}
          />
          <StatCard
            icon={HiTrendingUp}
            label="Avg Time per Video"
            value={formatTimeSpent(analysisData.avgTimePerVideo)}
          />
          <StatCard
            icon={HiHeart}
            label="Top Platform"
            value={
              analysisData.topPlatforms[0]
                ? analysisData.topPlatforms[0].platform.toUpperCase()
                : 'N/A'
            }
          />
        </section>

        <section>
          <h2 className="mb-4 text-xl font-semibold">
            Platform Performance Overview
          </h2>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PLATFORM_CONFIGS.map((config) => {
              const platformData = aggregatedPlatformData.find(
                (p) => p.platform === config.id,
              );

              const Icon = config.icon;

              return (
                <Card
                  key={config.id}
                  className="border border-white/[0.08] backdrop-blur"
                >
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon
                          className="text-2xl"
                          style={{ color: config.color }}
                        />
                        <span className="font-semibold">{config.label}</span>
                      </div>
                      {platformData && (
                        <Badge className="bg-primary text-primary-foreground text-xs">
                          {platformData.videoCount} videos
                        </Badge>
                      )}
                    </div>

                    {platformData ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <MetricItem
                          label="Total Views"
                          value={formatCompactNumber(platformData.totalViews)}
                        />
                        <MetricItem
                          label="Total Likes"
                          value={formatCompactNumber(platformData.totalLikes)}
                        />
                        <MetricItem
                          label="Avg Engagement"
                          value={`${platformData.avgEngagement.toFixed(1)}%`}
                        />
                        <MetricItem
                          label="Viral Score"
                          value={platformData.avgViralScore.toFixed(0)}
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-foreground/60">
                        No data available
                      </p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section>
          <Card className="border border-white/[0.08] bg-card/80">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">Video Hook Breakdown</h2>
              <Table<IViralHookVideo>
                items={videos}
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
                              className="flex h-6 w-6 items-center justify-center bg-background/60"
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

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="border border-white/[0.08] bg-card/80">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold">Hook Type Effectiveness</h3>
              <div className="space-y-3">
                {analysisData.hookEffectiveness.length > 0 ? (
                  analysisData.hookEffectiveness.map((hook) => (
                    <div
                      key={hook.type}
                      className="flex items-center justify-between border border-white/[0.08] p-3"
                    >
                      <div>
                        <p className="font-medium capitalize">
                          {hook.type} Hooks
                        </p>
                        <p className="text-xs text-foreground/60">
                          {hook.count} instances found
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {hook.avgEffectiveness}%
                        </p>
                        <p className="text-xs text-foreground/60">
                          avg effectiveness
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground/60">
                    No hook effectiveness data yet.
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card className="border border-white/[0.08] bg-card/80">
            <div className="p-6 space-y-4">
              <h3 className="text-lg font-semibold">
                Top Performing Hook Patterns
              </h3>
              <div className="space-y-3">
                {analysisData.topHooks.length > 0 ? (
                  analysisData.topHooks.map((hook, idx) => (
                    <div
                      key={hook}
                      className="flex items-start gap-3 border border-white/[0.08] p-3"
                    >
                      <Badge className="bg-primary text-primary-foreground text-xs mt-1">
                        #{idx + 1}
                      </Badge>
                      <p className="text-sm">{hook}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-foreground/60">
                    No top hook patterns detected yet.
                  </p>
                )}
              </div>
              <div className="mt-4 bg-background/40 p-3">
                <p className="text-xs text-foreground/60">
                  <strong>Pro tip</strong> Videos with pattern interrupts in the
                  first 3 seconds show 45% higher completion rates across all
                  platforms.
                </p>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </Container>
  );
}
