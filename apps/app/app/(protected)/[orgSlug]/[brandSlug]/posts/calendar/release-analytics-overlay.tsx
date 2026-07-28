'use client';

import type {
  IReleaseGroup,
  IReleaseTargetAnalyticsMetrics,
  SchedulerAnalyticsComparisonMetric,
} from '@genfeedai/interfaces';
import { Badge } from '@ui/primitives/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';

interface ReleaseAnalyticsOverlayProps {
  onClose: () => void;
  release: IReleaseGroup | null;
}

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

export default function ReleaseAnalyticsOverlay({
  onClose,
  release,
}: ReleaseAnalyticsOverlayProps): React.JSX.Element {
  const comparison = release?.analyticsComparison;

  return (
    <Sheet
      open={Boolean(release)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 shadow-dialog sm:max-w-[min(72rem,94vw)]"
      >
        <div className="border-b border-border bg-background/95 px-6 pb-5 pt-6 backdrop-blur">
          <SheetHeader className="space-y-3 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Release analytics</Badge>
              {comparison ? (
                <Badge variant={STATE_VARIANTS[comparison.state]}>
                  {comparison.state}
                </Badge>
              ) : null}
            </div>
            <SheetTitle>{release?.title ?? 'Release detail'}</SheetTitle>
            <SheetDescription>
              Compare normalized metrics by publishing target. Each value keeps
              its collection freshness and snapshot identity.
            </SheetDescription>
          </SheetHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {!comparison || comparison.targets.length === 0 ? (
            <div className="bg-muted/35 p-6 shadow-sm">
              <h3 className="font-medium text-foreground">
                No target analytics yet
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Metrics appear after a published target has a collected
                analytics snapshot.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto bg-card shadow-sm ring-1 ring-border/60">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Normalized analytics metrics by release target
                </caption>
                <thead className="bg-muted/45 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Target
                    </th>
                    {comparison.metricDefinitions.map((metric) => (
                      <th
                        key={metric}
                        scope="col"
                        className="px-4 py-3 text-right font-medium"
                      >
                        {METRIC_LABELS[metric]}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 font-medium">
                      Evidence
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.targets.map((target) => (
                    <tr key={target.targetId}>
                      <th
                        scope="row"
                        className="px-4 py-4 text-left font-medium capitalize text-foreground"
                      >
                        {target.platform}
                      </th>
                      {comparison.metricDefinitions.map((metric) => (
                        <td
                          key={metric}
                          className="px-4 py-4 text-right tabular-nums text-foreground"
                        >
                          {formatMetric(metric, target.metrics)}
                        </td>
                      ))}
                      <td className="px-4 py-4">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
