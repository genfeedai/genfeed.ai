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
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { buildTrendAgentHref } from '@utils/url/desktop-loop-url.util';
import {
  ChartColumn,
  Flame,
  Globe,
  Hash,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import TrendDetailAnalysisCard from './trend-detail-analysis-card';
import TrendDetailHeader from './trend-detail-header';
import TrendDetailRelatedTable from './trend-detail-related-table';

const TREND_KPI_PLACEHOLDERS = [
  {
    description: 'Total mentions',
    icon: Hash,
    iconClassName: 'bg-primary/10 text-primary',
    label: 'Mentions',
    value: '-',
  },
  {
    description: 'Week-over-week',
    icon: TrendingUp,
    iconClassName: 'bg-success/10 text-success',
    label: 'Growth Rate',
    value: '-',
  },
  {
    description: 'Calculated score',
    icon: Sparkles,
    iconClassName: 'bg-secondary/10 text-secondary',
    label: 'Virality Score',
    value: '-',
  },
  {
    description: 'Average engagement',
    icon: Flame,
    iconClassName: 'bg-accent/10 text-accent',
    label: 'Engagement Rate',
    value: '-',
  },
  {
    description: 'Total reach',
    icon: Globe,
    iconClassName: 'bg-info/10 text-info',
    label: 'Reach',
    value: '-',
  },
  {
    description: 'Total impressions',
    icon: ChartColumn,
    iconClassName: 'bg-warning/10 text-warning',
    label: 'Impressions',
    value: '-',
  },
];

export default function TrendDetail({
  backHref = '/discover/overview',
  trendId,
}: TrendDetailProps) {
  const router = useRouter();
  const translate = useTranslations('pages.analytics.trends.detail');
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

  if (error) {
    return (
      <Container label="Error" icon={Flame}>
        <Alert type={AlertCategory.ERROR}>
          {error}
          <Button
            label="Go Back"
            size={ButtonSize.SM}
            onClick={() => router.back()}
          />
        </Alert>
      </Container>
    );
  }

  if (!isLoading && !data) {
    return (
      <Container label="Error" icon={Flame}>
        <Alert type={AlertCategory.ERROR}>
          {translate('notFound')}
          <Button
            label="Go Back"
            size={ButtonSize.SM}
            onClick={() => router.back()}
          />
        </Alert>
      </Container>
    );
  }

  const trend = data?.trend;
  const relatedTrends = data?.relatedTrends ?? [];
  const analysis = data?.analysis;

  const kpiItems = trend
    ? [
        {
          description: 'Total mentions',
          icon: Hash,
          iconClassName: 'bg-primary/10 text-primary',
          label: 'Mentions',
          value: formatCompactNumber(trend.mentions),
          valueClassName: 'text-primary',
        },
        {
          description: 'Week-over-week',
          icon: TrendingUp,
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
          icon: Sparkles,
          iconClassName: 'bg-secondary/10 text-secondary',
          label: 'Virality Score',
          value: `${trend.viralityScore}/100`,
          valueClassName: 'text-secondary',
        },
        {
          description: 'Average engagement',
          icon: Flame,
          iconClassName: 'bg-accent/10 text-accent',
          label: 'Engagement Rate',
          value: trend.metadata?.engagementRate
            ? `${trend.metadata.engagementRate.toFixed(1)}%`
            : 'N/A',
          valueClassName: 'text-accent',
        },
        {
          description: 'Total reach',
          icon: Globe,
          iconClassName: 'bg-info/10 text-info',
          label: 'Reach',
          value: trend.metadata?.reach
            ? formatCompactNumber(trend.metadata.reach)
            : 'N/A',
          valueClassName: 'text-info',
        },
        {
          description: 'Total impressions',
          icon: ChartColumn,
          iconClassName: 'bg-warning/10 text-warning',
          label: 'Impressions',
          value: trend.metadata?.impressions
            ? formatCompactNumber(trend.metadata.impressions)
            : 'N/A',
          valueClassName: 'text-warning',
        },
      ]
    : TREND_KPI_PLACEHOLDERS;

  return (
    <Container
      className="py-6"
      left={
        trend ? (
          <TrendDetailHeader
            backHref={backHref}
            trend={trend}
            onBack={() => router.push(backHref)}
          />
        ) : (
          <div className="flex items-center gap-3">
            <Flame className="size-5 text-foreground/60" />
            <h1 className="text-lg font-semibold text-foreground">
              {translate('loadingTitle')}
            </h1>
          </div>
        )
      }
    >
      {/* KPI Section */}
      <KPISection
        title="Trend Metrics"
        items={kpiItems}
        gridCols={{ desktop: 6, mobile: 2, tablet: 3 }}
        isLoading={isLoading}
      />

      {!trend ? (
        <div
          className="mt-6 animate-pulse space-y-6"
          data-testid="trend-detail-body-skeleton"
        >
          <div className="h-32 bg-background" />
          <div className="h-64 bg-background" />
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              label="Remix in Agent"
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              icon={<Sparkles className="size-4" />}
              onClick={() => router.push(buildTrendAgentHref(trend))}
            />
          </div>

          {/* Trend Analysis Card */}
          <div className="mt-6">
            <TrendDetailAnalysisCard analysis={analysis} />
          </div>

          {/* Hashtags */}
          {trend.metadata?.hashtags && trend.metadata.hashtags.length > 0 && (
            <div className="mt-6">
              <Card label="Related Hashtags" icon={Hash}>
                <div className="flex flex-wrap gap-2">
                  {trend.metadata.hashtags.map((hashtag) => (
                    <Badge
                      key={hashtag}
                      value={hashtag.startsWith('#') ? hashtag : `#${hashtag}`}
                      className="border border-border bg-transparent"
                    />
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Sample Content */}
          {trend.metadata?.sampleContent && (
            <div className="mt-6">
              <Card label="Sample Content" icon={Sparkles}>
                <p className="text-foreground/80 whitespace-pre-wrap">
                  {trend.metadata.sampleContent}
                </p>
              </Card>
            </div>
          )}

          {/* Cross-Platform Trends */}
          <TrendDetailRelatedTable
            relatedTrends={relatedTrends}
            getRowLink={(item) => ({
              href: `/discover/${item.id}`,
              label: `Open ${item.topic}`,
            })}
          />
        </>
      )}
    </Container>
  );
}
