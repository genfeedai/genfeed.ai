'use client';

import type { AgentRunStats } from '@cloud/types';

interface RunStatsStripProps {
  stats: AgentRunStats | null;
  isLoading: boolean;
}

export default function RunStatsStrip({
  stats,
  isLoading,
}: RunStatsStripProps) {
  const items = [
    { label: 'Active', value: stats?.activeRuns ?? 0 },
    { label: 'Completed Today', value: stats?.completedToday ?? 0 },
    { label: 'Failed Today', value: stats?.failedToday ?? 0 },
    { label: 'Credits Today', value: stats?.totalCreditsToday ?? 0 },
    { label: 'Auto Routed', value: stats?.autoRoutedRuns ?? 0 },
    { label: 'Web Enabled', value: stats?.webEnabledRuns ?? 0 },
    {
      label: 'Top Actual Model',
      value: stats?.topActualModels[0]?.model ?? 'Untracked',
    },
    {
      label: 'Top Requested Model',
      value: stats?.topRequestedModels[0]?.model ?? 'Untracked',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-8">
      {items.map((item) => (
        <div key={item.label} className="gen-card flex flex-col gap-1 p-4">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {item.label}
          </span>
          {isLoading ? (
            <div className="h-7 w-16 animate-pulse bg-muted" />
          ) : (
            <span className="text-2xl font-bold tabular-nums break-words">
              {typeof item.value === 'number'
                ? item.value.toLocaleString()
                : item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
