import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useCallback, useRef, useState } from 'react';

interface AgentStrategyStatusProps {
  apiService: AgentStrategyApiService;
}

function formatRelativeTime(dateStr: string): string {
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

function formatFutureTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 0) {
    return 'Overdue';
  }
  if (diffMins < 60) {
    return `in ${diffMins}m`;
  }
  if (diffHours < 24) {
    return `in ${diffHours}h`;
  }
  return date.toLocaleDateString();
}

export function AgentStrategyStatus({
  apiService,
}: AgentStrategyStatusProps): ReactElement {
  const strategy = useAgentStrategyStore((s) => s.strategy);
  const setStrategy = useAgentStrategyStore((s) => s.setStrategy);
  const abortRef = useRef<AbortController | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleEnabled = useCallback(async () => {
    if (!strategy || isToggling) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsToggling(true);

    try {
      const updated = await runAgentApiEffect(
        apiService.updateStrategyEffect(
          strategy.id,
          { isEnabled: !strategy.isEnabled },
          abortRef.current.signal,
        ),
      );
      setStrategy(updated);
    } catch {
      // Silently ignore aborted/failed requests
    } finally {
      setIsToggling(false);
    }
  }, [strategy, apiService, setStrategy, isToggling]);

  const handleRunNow = useCallback(async () => {
    if (!strategy) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      await runAgentApiEffect(
        apiService.runNowEffect(strategy.id, abortRef.current.signal),
      );
    } catch {
      // Silently ignore aborted/failed requests
    }
  }, [strategy, apiService]);

  if (!strategy) {
    return (
      <div className="border border-border p-6 text-center">
        <p className="text-xs text-muted-foreground">
          No strategy configured yet. Create one in the configuration above.
        </p>
      </div>
    );
  }

  const dailyPercent =
    strategy.dailyCreditBudget > 0
      ? Math.min(
          100,
          (strategy.creditsUsedToday / strategy.dailyCreditBudget) * 100,
        )
      : 0;

  const weeklyPercent =
    strategy.weeklyCreditBudget > 0
      ? Math.min(
          100,
          (strategy.creditsUsedThisWeek / strategy.weeklyCreditBudget) * 100,
        )
      : 0;

  return (
    <div
      className={`space-y-4 border border-border p-4 transition-opacity ${
        strategy.isEnabled ? '' : 'opacity-50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </h3>
          {!strategy.isEnabled && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Paused
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              strategy.isActive && strategy.isEnabled
                ? 'bg-green-500/10 text-green-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {strategy.isActive && strategy.isEnabled ? 'Active' : 'Inactive'}
          </span>
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={handleToggleEnabled}
            isDisabled={isToggling}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              strategy.isEnabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform ${
                strategy.isEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </Button>
        </div>
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Last run</p>
          <p className="text-xs font-medium text-foreground">
            {strategy.lastRunAt
              ? formatRelativeTime(strategy.lastRunAt)
              : 'Never'}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground">Next run</p>
          <p className="text-xs font-medium text-foreground">
            {strategy.nextRunAt
              ? formatFutureTime(strategy.nextRunAt)
              : 'Not scheduled'}
          </p>
        </div>
      </div>

      {/* Daily budget */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Daily credits</p>
          <p className="text-[10px] text-muted-foreground">
            {strategy.creditsUsedToday} / {strategy.dailyCreditBudget}
          </p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${
              dailyPercent >= 90 ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${dailyPercent}%` }}
          />
        </div>
      </div>

      {/* Weekly budget */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">Weekly credits</p>
          <p className="text-[10px] text-muted-foreground">
            {strategy.creditsUsedThisWeek} / {strategy.weeklyCreditBudget}
          </p>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted">
          <div
            className={`h-1.5 rounded-full transition-all ${
              weeklyPercent >= 90 ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${weeklyPercent}%` }}
          />
        </div>
      </div>

      {/* Consecutive failures warning */}
      {strategy.consecutiveFailures > 0 && (
        <div className="flex items-center gap-2 rounded bg-destructive/10 px-3 py-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-destructive"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span className="text-xs text-destructive">
            {strategy.consecutiveFailures} consecutive failure
            {strategy.consecutiveFailures > 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Run Now */}
      <Button
        variant={ButtonVariant.OUTLINE}
        onClick={handleRunNow}
        isDisabled={!strategy.isActive || !strategy.isEnabled}
        className="w-full"
      >
        Run Now
      </Button>
    </div>
  );
}
