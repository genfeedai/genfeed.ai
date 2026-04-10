'use client';

import type { AgentRunStats, AgentRunTrendPoint } from '@genfeedai/types';

interface RunTrendsPanelProps {
  stats: AgentRunStats | null;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function renderSeries(
  points: AgentRunTrendPoint[],
  key: 'autoRoutedRate' | 'webEnabledRate',
) {
  const maxValue = Math.max(...points.map((point) => point[key]), 0.01);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(28px,1fr))] gap-2">
      {points.map((point) => {
        const value = point[key];

        return (
          <div
            key={`${key}:${point.bucket}`}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex h-24 w-full items-end rounded bg-muted/50 px-1">
              <div
                className="w-full rounded-t bg-sky-500/80"
                style={{
                  height: `${Math.max((value / maxValue) * 100, value > 0 ? 8 : 0)}%`,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {point.bucket.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RunTrendsPanel({ stats }: RunTrendsPanelProps) {
  const trends = stats?.trends ?? [];
  const latestPoint = trends[trends.length - 1];

  return (
    <div className="gen-card flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Routing Trends
          </h2>
          <p className="text-xs text-muted-foreground">
            Time window: {stats?.timeRange ?? '7d'}
          </p>
        </div>
        {latestPoint && (
          <div className="text-right text-xs text-muted-foreground">
            <div>Auto: {formatPercent(latestPoint.autoRoutedRate)}</div>
            <div>Web: {formatPercent(latestPoint.webEnabledRate)}</div>
          </div>
        )}
      </div>

      {trends.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Trend data will appear once runs accumulate in the selected window.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Auto-routed rate
            </span>
            {renderSeries(trends, 'autoRoutedRate')}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Web-enabled rate
            </span>
            {renderSeries(trends, 'webEnabledRate')}
          </div>
        </div>
      )}
    </div>
  );
}
