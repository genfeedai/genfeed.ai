'use client';

import type { ICampaignMetricAvailability } from '@genfeedai/contracts/interfaces';
import { useCampaignPerformance } from '@hooks/data/campaigns/use-campaign-performance';
import Card from '@ui/card/Card';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import LoadingState from '@ui/feedback/LoadingState';
import { useTranslations } from 'next-intl';

function formatMetric(metric: ICampaignMetricAvailability): string {
  if (metric.value === null) {
    return '—';
  }
  return metric.value.toLocaleString();
}

function metricDescription(
  metric: ICampaignMetricAvailability,
  unavailableLabel: string,
  coverageLabel: (available: number, total: number) => string,
): string {
  if (metric.availablePostCount === 0) {
    return unavailableLabel;
  }
  return coverageLabel(metric.availablePostCount, metric.totalPostCount);
}

export default function CampaignDetailPerformance({
  campaignId,
}: {
  campaignId: string;
}) {
  const translate = useTranslations('pages.publishing.campaigns');
  const { error, isLoading, performance, refetch } =
    useCampaignPerformance(campaignId);

  if (error) {
    return (
      <ErrorFallback
        resetErrorBoundary={() => {
          void refetch();
        }}
      />
    );
  }

  if (isLoading || !performance) {
    return <LoadingState isFullSize />;
  }

  const coverage = (available: number, total: number) =>
    translate('performanceCoverage', { available, total });
  const unavailable = translate('performanceUnavailable');

  return (
    <div className="grid gap-6 p-5 sm:p-6">
      <MetricCardGrid columns={4}>
        <MetricCard
          description={metricDescription(
            performance.organic.views,
            unavailable,
            coverage,
          )}
          label={translate('performanceViews')}
          value={formatMetric(performance.organic.views)}
        />
        <MetricCard
          description={metricDescription(
            performance.organic.engagements,
            unavailable,
            coverage,
          )}
          label={translate('performanceEngagements')}
          value={formatMetric(performance.organic.engagements)}
        />
        <MetricCard
          description={metricDescription(
            performance.organic.clicks,
            unavailable,
            coverage,
          )}
          label={translate('performanceClicks')}
          value={formatMetric(performance.organic.clicks)}
        />
        <MetricCard
          description={metricDescription(
            performance.organic.conversions,
            unavailable,
            coverage,
          )}
          label={translate('performanceConversions')}
          value={formatMetric(performance.organic.conversions)}
        />
      </MetricCardGrid>
      <Card label={translate('performanceCounts')}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {Object.entries(performance.postCounts).map(([status, count]) => (
            <div key={status}>
              <dt className="text-foreground/50">{status}</dt>
              <dd className="mt-1 text-foreground">{count}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {performance.byPlatform.length > 0 ? (
        <Card label={translate('performanceByPlatform')}>
          <ul className="grid gap-3 text-sm">
            {performance.byPlatform.map((row) => (
              <li key={row.platform}>
                {row.platform}: {formatMetric(row.views)}{' '}
                {translate('performanceViews').toLowerCase()}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
