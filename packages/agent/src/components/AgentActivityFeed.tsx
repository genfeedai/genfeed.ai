import type { AgentStrategyRun } from '@genfeedai/agent/models/agent-strategy.model';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useEffect, useMemo } from 'react';

interface AgentActivityFeedProps {
  apiService: AgentStrategyApiService;
  onViewThread?: (threadId: string) => void;
}

function formatRunTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) {
    return 'Just now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

function getStatusBadge(status: AgentStrategyRun['status']): {
  className: string;
  label: string;
} {
  switch (status) {
    case 'completed':
      return {
        className: 'bg-green-500/10 text-green-500',
        label: 'Completed',
      };
    case 'failed':
      return {
        className: 'bg-destructive/10 text-destructive',
        label: 'Failed',
      };
    case 'budget_exhausted':
      return {
        className: 'bg-yellow-500/10 text-yellow-600',
        label: 'Budget',
      };
  }
}

export function AgentActivityFeed({
  apiService,
  onViewThread,
}: AgentActivityFeedProps): ReactElement {
  const strategy = useAgentStrategyStore((s) => s.strategy);
  const setStrategy = useAgentStrategyStore((s) => s.setStrategy);
  const isLoading = useAgentStrategyStore((s) => s.isLoading);
  const setIsLoading = useAgentStrategyStore((s) => s.setIsLoading);
  const setError = useAgentStrategyStore((s) => s.setError);

  useEffect(() => {
    if (strategy) {
      return;
    }

    const controller = new AbortController();

    const fetchStrategy = async () => {
      setIsLoading(true);
      try {
        const strategies = await runAgentApiEffect(
          apiService.getStrategiesEffect(controller.signal),
        );
        if (strategies.length > 0) {
          setStrategy(strategies[0]);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load activity',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchStrategy();
    return () => controller.abort();
  }, [strategy, apiService, setStrategy, setIsLoading, setError]);

  const runs = useMemo(
    () =>
      strategy?.runHistory
        ? [...strategy.runHistory].sort(
            (a, b) =>
              new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
          )
        : [],
    [strategy?.runHistory],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground">
          Activity from autopilot runs will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Activity
      </h3>

      <div className="space-y-2">
        {runs.map((run) => {
          const badge = getStatusBadge(run.status);
          return (
            <div
              key={run.startedAt}
              className="flex items-center justify-between border border-border px-4 py-3 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
                >
                  {badge.label}
                </span>
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-foreground">
                    {run.contentGenerated} content generated
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatRunTime(run.startedAt)}
                    {run.completedAt &&
                      ` — ${Math.round(
                        (new Date(run.completedAt).getTime() -
                          new Date(run.startedAt).getTime()) /
                          1000,
                      )}s`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {run.creditsUsed} credits
                </span>

                {run.threadId && onViewThread && (
                  <Button
                    variant={ButtonVariant.OUTLINE}
                    size={ButtonSize.XS}
                    onClick={() => onViewThread(run.threadId)}
                  >
                    View
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
