'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  TrendDetailData,
  TrendDetailProps,
} from '@props/trends/trends-page.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { TrendsService } from '@services/social/trends.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Table from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { PLATFORM_CONFIGS } from '@ui-constants/platform.constant';
import {
  buildTrendAgentHref,
  buildTrendStudioHref,
} from '@utils/url/desktop-loop-url.util';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HiArrowLeft,
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiOutlineArrowTrendingUp,
  HiOutlineChartBar,
  HiOutlineFire,
  HiOutlineGlobeAlt,
  HiOutlineHashtag,
  HiOutlineSparkles,
} from 'react-icons/hi2';

export default function TrendDetail({ trendId }: TrendDetailProps) {
  const router = useRouter();
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();

  const [data, setData] = useState<TrendDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchTrendDetail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getTrendsService();
        const detail = await service.getTrendById(trendId);
        setData(detail);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          return;
        }
        logger.error('Failed to fetch trend detail', err);
        setError('Failed to load trend details');
        notificationsService.error('Failed to load trend details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrendDetail();
    return () => controller.abort();
  }, [trendId, getTrendsService, notificationsService]);

  if (isLoading) {
    return (
      <Container label="Loading..." icon={HiOutlineFire}>
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-background" />
          <div className="h-64 bg-background" />
        </div>
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container label="Error" icon={HiOutlineFire}>
        <Alert type={AlertCategory.ERROR}>
          {error || 'Trend not found'}
          <Button
            label="Go Back"
            size={ButtonSize.SM}
            onClick={() => router.back()}
          />
        </Alert>
      </Container>
    );
  }

  const { trend, relatedTrends, analysis } = data;
  const platformConfig = PLATFORM_CONFIGS[trend.platform];

  function getTrendDirectionIcon() {
    switch (analysis.trendDirection) {
      case 'rising':
        return <HiArrowTrendingUp className="h-5 w-5 text-success" />;
      case 'falling':
        return <HiArrowTrendingDown className="h-5 w-5 text-error" />;
      default:
        return <HiOutlineChartBar className="h-5 w-5 text-warning" />;
    }
  }

  function getGrowthRateClass(rate: number): string {
    if (rate > 0) {
      return 'text-success';
    }
    if (rate < 0) {
      return 'text-error';
    }
    return '';
  }

  const kpiItems = [
    {
      description: 'Total mentions',
      icon: HiOutlineHashtag,
      iconClassName: 'bg-primary/10 text-primary',
      label: 'Mentions',
      value: formatCompactNumber(trend.mentions),
      valueClassName: 'text-primary',
    },
    {
      description: 'Week-over-week',
      icon: HiOutlineArrowTrendingUp,
      iconClassName:
        trend.growthRate > 0
          ? 'bg-success/10 text-success'
          : 'bg-error/10 text-error',
      label: 'Growth Rate',
      value: `${trend.growthRate > 0 ? '+' : ''}${trend.growthRate}%`,
      valueClassName: trend.growthRate > 0 ? 'text-success' : 'text-error',
    },
    {
      description: 'Calculated score',
      icon: HiOutlineSparkles,
      iconClassName: 'bg-secondary/10 text-secondary',
      label: 'Virality Score',
      value: `${trend.viralityScore}/100`,
      valueClassName: 'text-secondary',
    },
    {
      description: 'Average engagement',
      icon: HiOutlineFire,
      iconClassName: 'bg-accent/10 text-accent',
      label: 'Engagement Rate',
      value: trend.metadata?.engagementRate
        ? `${trend.metadata.engagementRate.toFixed(1)}%`
        : 'N/A',
      valueClassName: 'text-accent',
    },
    {
      description: 'Total reach',
      icon: HiOutlineGlobeAlt,
      iconClassName: 'bg-info/10 text-info',
      label: 'Reach',
      value: trend.metadata?.reach
        ? formatCompactNumber(trend.metadata.reach)
        : 'N/A',
      valueClassName: 'text-info',
    },
    {
      description: 'Total impressions',
      icon: HiOutlineChartBar,
      iconClassName: 'bg-warning/10 text-warning',
      label: 'Impressions',
      value: trend.metadata?.impressions
        ? formatCompactNumber(trend.metadata.impressions)
        : 'N/A',
      valueClassName: 'text-warning',
    },
  ];

  return (
    <Container
      className="py-6"
      left={
        <div className="space-y-3">
          <Button
            label="Back to Trends"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            icon={<HiArrowLeft className="h-4 w-4" />}
            onClick={() => router.push('/research/discovery')}
          />
          <div className="flex items-center gap-3">
            {platformConfig && (
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full"
                style={{ backgroundColor: `${platformConfig.color}20` }}
              >
                <platformConfig.icon
                  className="h-5 w-5"
                  style={{ color: platformConfig.color }}
                />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 text-sm text-foreground/60">
                <span className="uppercase tracking-wide font-semibold">
                  {platformConfig?.label || trend.platform}
                </span>
                <span>•</span>
                <span>Trending Topic</span>
              </div>
              <h1 className="text-2xl font-bold">{trend.topic}</h1>
            </div>
          </div>
        </div>
      }
    >
      {/* KPI Section */}
      <KPISection
        title="Trend Metrics"
        items={kpiItems}
        gridCols={{ desktop: 6, mobile: 2, tablet: 3 }}
        isLoading={false}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          label="Generate From Trend"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          icon={<HiOutlineSparkles className="h-4 w-4" />}
          onClick={() => router.push(buildTrendStudioHref(trend))}
        />
        <Button
          label="Open In Agent"
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          icon={<HiOutlineFire className="h-4 w-4" />}
          onClick={() => router.push(buildTrendAgentHref(trend))}
        />
      </div>

      {/* Trend Analysis Card */}
      <div className="mt-6">
        <Card label="Trend Analysis" icon={HiOutlineChartBar}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <span className="text-sm text-foreground/60">Direction</span>
              <div className="flex items-center gap-2">
                {getTrendDirectionIcon()}
                <span className="text-lg font-semibold capitalize">
                  {analysis.trendDirection}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm text-foreground/60">
                Avg Virality (14d)
              </span>
              <div className="text-lg font-semibold">
                {analysis.averageViralityScore}/100
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm text-foreground/60">
                Growth Rate (14d)
              </span>
              <div
                className={`text-lg font-semibold ${getGrowthRateClass(analysis.growthRate)}`}
              >
                {analysis.growthRate > 0 ? '+' : ''}
                {analysis.growthRate}%
              </div>
            </div>
          </div>
          {analysis.peakDate && (
            <div className="mt-4 pt-4 border-t border-white/[0.08]">
              <span className="text-sm text-foreground/60">
                Peak: {formatCompactNumber(analysis.peakMentions || 0)} mentions
                on {new Date(analysis.peakDate).toLocaleDateString()}
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* Hashtags */}
      {trend.metadata?.hashtags && trend.metadata.hashtags.length > 0 && (
        <div className="mt-6">
          <Card label="Related Hashtags" icon={HiOutlineHashtag}>
            <div className="flex flex-wrap gap-2">
              {trend.metadata.hashtags.map((hashtag) => (
                <Badge
                  key={hashtag}
                  value={hashtag.startsWith('#') ? hashtag : `#${hashtag}`}
                  className="border border-white/[0.08] bg-transparent"
                />
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Sample Content */}
      {trend.metadata?.sampleContent && (
        <div className="mt-6">
          <Card label="Sample Content" icon={HiOutlineSparkles}>
            <p className="text-foreground/80 whitespace-pre-wrap">
              {trend.metadata.sampleContent}
            </p>
          </Card>
        </div>
      )}

      {/* Cross-Platform Trends */}
      {relatedTrends.length > 0 && (
        <div className="mt-6">
          <Card label="Cross-Platform Trends" icon={HiOutlineGlobeAlt}>
            <p className="text-sm text-foreground/60 mb-4">
              Similar trends on other platforms
            </p>
            <Table
              items={relatedTrends}
              getRowKey={(item) => item.id}
              onRowClick={(item) => router.push(`/research/${item.id}`)}
              columns={[
                {
                  header: 'Platform',
                  key: 'platform',
                  render: (item) => {
                    const config = PLATFORM_CONFIGS[item.platform];
                    const Icon = config?.icon;
                    return (
                      <div className="flex items-center gap-2">
                        {Icon && (
                          <Icon
                            className="h-4 w-4"
                            style={{ color: config?.color }}
                          />
                        )}
                        <span>{config?.label || item.platform}</span>
                      </div>
                    );
                  },
                },
                {
                  header: 'Topic',
                  key: 'topic',
                  render: (item) => (
                    <span className="font-medium">{item.topic}</span>
                  ),
                },
                {
                  header: 'Mentions',
                  key: 'mentions',
                  render: (item) => formatCompactNumber(item.mentions),
                },
                {
                  header: 'Growth',
                  key: 'growthRate',
                  render: (item) => (
                    <span
                      className={
                        item.growthRate > 0 ? 'text-success' : 'text-error'
                      }
                    >
                      {item.growthRate > 0 ? '+' : ''}
                      {item.growthRate}%
                    </span>
                  ),
                },
                {
                  header: 'Virality',
                  key: 'viralityScore',
                  render: (item) => (
                    <Badge value={item.viralityScore} className="text-xs" />
                  ),
                },
              ]}
            />
          </Card>
        </div>
      )}
    </Container>
  );
}
