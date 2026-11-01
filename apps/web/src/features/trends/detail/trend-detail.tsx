'use client';

import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
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

const TREND_KPI_METRICS = [
  {
    icon: Hash,
    tone: 'primary' as const,
    key: 'mentions',
  },
  {
    icon: TrendingUp,
    tone: 'success' as const,
    key: 'growthRate',
  },
  {
    icon: Sparkles,
    tone: 'muted' as const,
    key: 'viralityScore',
  },
  {
    analyticsMetric: 'engagementRate' as const,
    icon: Flame,
    tone: 'accent' as const,
    key: 'engagementRate',
  },
  {
    icon: Globe,
    tone: 'info' as const,
    key: 'reach',
  },
  {
    icon: ChartColumn,
    tone: 'warning' as const,
    key: 'impressions',
  },
] as const;

export default function TrendDetail({
  backHref = '/discovery/trends',
  trendId,
}: TrendDetailProps) {
  const router = useRouter();
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.analytics.trends.detail');
  const metricCopy = (key: (typeof TREND_KPI_METRICS)[number]['key']) => ({
    label: translate(`metrics.${key}.label`),
  });
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
      <Container label={translate('error')} icon={Flame}>
        <Alert type={AlertCategory.ERROR}>
          {error}
          <Button
            label={translate('goBack')}
            size={ButtonSize.SM}
            onClick={() => router.back()}
          />
        </Alert>
      </Container>
    );
  }

  if (!isLoading && !data) {
    return (
      <Container label={translate('error')} icon={Flame}>
        <Alert type={AlertCategory.ERROR}>
          {translate('notFound')}
          <Button
            label={translate('goBack')}
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
          ...metricCopy('mentions'),
          icon: Hash,
          value: formatCompactNumber(trend.mentions),
          tone: 'primary' as const,
        },
        {
          ...metricCopy('growthRate'),
          icon: TrendingUp,
          value: `${trend.growthRate > 0 ? '+' : ''}${trend.growthRate}%`,
          tone:
            trend.growthRate > 0
              ? ('success' as const)
              : ('destructive' as const),
        },
        {
          ...metricCopy('viralityScore'),
          icon: Sparkles,
          value: `${trend.viralityScore}/100`,
          tone: 'muted' as const,
        },
        {
          ...metricCopy('engagementRate'),
          icon: Flame,
          analyticsMetric: 'engagementRate' as const,
          value: trend.metadata?.engagementRate
            ? `${trend.metadata.engagementRate.toFixed(1)}%`
            : '-',
          tone: 'accent' as const,
        },
        {
          ...metricCopy('reach'),
          icon: Globe,
          value: trend.metadata?.reach
            ? formatCompactNumber(trend.metadata.reach)
            : '-',
          tone: 'info' as const,
        },
        {
          ...metricCopy('impressions'),
          icon: ChartColumn,
          value: trend.metadata?.impressions
            ? formatCompactNumber(trend.metadata.impressions)
            : '-',
          tone: 'warning' as const,
        },
      ]
    : TREND_KPI_METRICS.map(({ key, ...metric }) => ({
        ...metric,
        ...metricCopy(key),
        value: '-',
      }));

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
        title={translate('trendMetrics')}
        items={kpiItems}
        gridCols={{ desktop: 6, mobile: 2 }}
        isLoading={isLoading}
      />

      {trend ? (
        <>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              label={translate('remixInAgent')}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              icon={<Sparkles className="size-4" />}
              onClick={() => router.push(buildTrendAgentHref(trend))}
            />
          </div>

          {/* Trend Analysis Card */}
          {analysis && (
            <div className="mt-6">
              <TrendDetailAnalysisCard analysis={analysis} />
            </div>
          )}

          {/* Hashtags */}
          {trend.metadata?.hashtags && trend.metadata.hashtags.length > 0 && (
            <div className="mt-6">
              <Card label={translate('relatedHashtags')} icon={Hash}>
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
              <Card label={translate('sampleContent')} icon={Sparkles}>
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
              href: href(`${APP_ROUTES.DISCOVERY.TRENDS}/detail/${item.id}`),
              label: `Open ${item.topic}`,
            })}
          />
        </>
      ) : null}
    </Container>
  );
}
