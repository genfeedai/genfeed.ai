'use client';

import type { AgentRunStats } from '@genfeedai/types';

interface RunRoutingInsightsProps {
  stats: AgentRunStats | null;
}

function formatRoutingLabel(
  requestedModel: string,
  actualModel: string,
): string {
  return requestedModel === actualModel
    ? actualModel
    : `${requestedModel} -> ${actualModel}`;
}

export default function RunRoutingInsights({ stats }: RunRoutingInsightsProps) {
  const routingPaths = stats?.routingPaths ?? [];
  const totalRoutedRuns = routingPaths.reduce(
    (sum, path) => sum + path.count,
    0,
  );

  return (
    <div className="gen-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Routing Paths
          </h2>
          <p className="text-xs text-muted-foreground">
            Requested model to resolved model transitions.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {totalRoutedRuns.toLocaleString()} routed runs
        </span>
      </div>

      {routingPaths.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          No routing path data available yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {routingPaths.map((path) => {
            const share =
              totalRoutedRuns > 0
                ? Math.round((path.count / totalRoutedRuns) * 100)
                : 0;

            return (
              <div
                key={`${path.requestedModel}:${path.actualModel}`}
                className="flex flex-col gap-1"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    {formatRoutingLabel(path.requestedModel, path.actualModel)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {path.count} runs
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-emerald-500/80"
                    style={{ width: `${Math.max(share, 4)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
