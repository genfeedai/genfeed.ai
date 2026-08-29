'use client';

import type { WorkflowExecutionStats } from '@genfeedai/types';

interface RunStatsStripProps {
  isLoading: boolean;
  stats: WorkflowExecutionStats;
}

export default function RunStatsStrip({
  isLoading,
  stats,
}: RunStatsStripProps) {
  const items = [
    { label: 'Total', value: stats.total },
    { label: 'Active', value: stats.active },
    { label: 'Completed', value: stats.completed },
    { label: 'Failed', value: stats.failed },
    { label: 'Credits', value: stats.totalCredits },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <div className="gen-card flex flex-col gap-1 p-4" key={item.label}>
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          {isLoading ? (
            <div className="h-7 w-16 animate-pulse bg-muted" />
          ) : (
            <span className="text-2xl font-bold tabular-nums">
              {item.value.toLocaleString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
