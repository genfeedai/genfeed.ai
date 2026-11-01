'use client';

import type {
  IReleaseTargetAnalyticsComparison,
  IReleaseTargetAnalyticsMetrics,
  SchedulerAnalyticsComparisonMetric,
} from '@genfeedai/contracts/interfaces';
import type { TableColumn } from '@props/ui/display/table.props';
import Table from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { EmptyStateCard } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import type { ReleaseAnalyticsTableProps } from '@/props/publisher/release-calendar.props';

/**
 * Collection state of the comparison as a whole. Kept visible next to the table
 * because a `ready` row set and a `mixed` one look identical cell-by-cell.
 */
const STATE_VARIANTS = {
  empty: 'secondary',
  error: 'destructive',
  mixed: 'warning',
  ready: 'success',
  stale: 'warning',
} as const;

const METRIC_LABELS: Record<SchedulerAnalyticsComparisonMetric, string> = {
  comments: 'Comments',
  engagementRate: 'Engagement',
  likes: 'Likes',
  saves: 'Saves',
  shares: 'Shares',
  views: 'Views',
};

function formatMetric(
  metric: SchedulerAnalyticsComparisonMetric,
  metrics: IReleaseTargetAnalyticsMetrics | null,
): string {
  if (!metrics) {
    return 'Unavailable';
  }

  const value = metrics[metric];
  return metric === 'engagementRate'
    ? new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
        style: 'percent',
      }).format(value)
    : new Intl.NumberFormat('en-US').format(value);
}

/**
 * Snapshot-bound analytics for every target of a release. Each value keeps its
 * collection freshness and snapshot identity alongside it, so observations from
 * different collection windows are never silently combined.
 */
export default function ReleaseAnalyticsTable({
  comparison,
}: ReleaseAnalyticsTableProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');

  if (!comparison || comparison.targets.length === 0) {
    return (
      <EmptyStateCard
        description={translate('analytics.emptyDescription')}
        title={translate('analytics.emptyTitle')}
      />
    );
  }

  const columns: TableColumn<IReleaseTargetAnalyticsComparison>[] = [
    {
      className: 'capitalize',
      header: translate('analytics.target'),
      key: 'platform',
      render: (target) => target.platform,
    },
    ...comparison.metricDefinitions.map(
      (metric): TableColumn<IReleaseTargetAnalyticsComparison> => ({
        className: 'text-right tabular-nums',
        header: METRIC_LABELS[metric],
        key: metric,
        render: (target) => formatMetric(metric, target.metrics),
      }),
    ),
    {
      header: translate('analytics.evidence'),
      key: 'evidence',
      render: (target) => (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className="capitalize">{target.collection.freshness}</span>
          {target.snapshotIdentity ? (
            <time dateTime={target.snapshotIdentity.updatedAt}>
              {translate('analytics.snapshot', {
                date: target.snapshotIdentity.snapshotDate,
              })}
            </time>
          ) : null}
          {target.collection.error ? (
            <span className="text-destructive">
              {target.collection.error.message}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <Badge variant={STATE_VARIANTS[comparison.state]}>
        {comparison.state}
      </Badge>
      <Table<IReleaseTargetAnalyticsComparison>
        ariaLabel={translate('analytics.caption')}
        columns={columns}
        getRowKey={(target) => target.targetId}
        items={comparison.targets}
      />
    </div>
  );
}
