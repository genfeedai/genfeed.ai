'use client';

import type {
  IReleaseTargetAnalyticsMetrics,
  SchedulerAnalyticsComparisonMetric,
} from '@genfeedai/interfaces';
import type { ReleaseAnalyticsTableProps } from '@props/publisher/release-calendar.props';
import { Badge } from '@ui/primitives/badge';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';

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
    ? new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 2,
        style: 'percent',
      }).format(value)
    : new Intl.NumberFormat().format(value);
}

/**
 * Snapshot-bound analytics for every target of a release. Each value keeps its
 * collection freshness and snapshot identity alongside it, so observations from
 * different collection windows are never silently combined.
 */
export default function ReleaseAnalyticsTable({
  comparison,
}: ReleaseAnalyticsTableProps): React.JSX.Element {
  if (!comparison || comparison.targets.length === 0) {
    return (
      <div className="bg-muted/35 p-6 shadow-sm">
        <h3 className="font-medium text-foreground">No target analytics yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Metrics appear after a published target has a collected analytics
          snapshot.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Badge variant={STATE_VARIANTS[comparison.state]}>
        {comparison.state}
      </Badge>
      <div className="overflow-x-auto bg-card shadow-sm ring-1 ring-border/60">
        <Table className="w-full border-collapse text-sm">
          <TableCaption className="sr-only">
            Normalized analytics metrics by channel target
          </TableCaption>
          <TableHeader className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <TableRow>
              <TableHead scope="col" className="px-4 py-3 font-medium">
                Target
              </TableHead>
              {comparison.metricDefinitions.map((metric) => (
                <TableHead
                  key={metric}
                  scope="col"
                  className="px-4 py-3 text-right font-medium"
                >
                  {METRIC_LABELS[metric]}
                </TableHead>
              ))}
              <TableHead scope="col" className="px-4 py-3 font-medium">
                Evidence
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {comparison.targets.map((target) => (
              <TableRow key={target.targetId}>
                <TableHead
                  scope="row"
                  className="px-4 py-4 text-left font-medium capitalize text-foreground"
                >
                  {target.platform}
                </TableHead>
                {comparison.metricDefinitions.map((metric) => (
                  <TableCell
                    key={metric}
                    className="px-4 py-4 text-right tabular-nums text-foreground"
                  >
                    {formatMetric(metric, target.metrics)}
                  </TableCell>
                ))}
                <TableCell className="px-4 py-4">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="capitalize">
                      {target.collection.freshness}
                    </span>
                    {target.snapshotIdentity ? (
                      <time dateTime={target.snapshotIdentity.updatedAt}>
                        Snapshot {target.snapshotIdentity.snapshotDate}
                      </time>
                    ) : null}
                    {target.collection.error ? (
                      <span className="text-destructive">
                        {target.collection.error.message}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
