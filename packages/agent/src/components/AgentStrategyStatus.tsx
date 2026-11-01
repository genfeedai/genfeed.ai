import type { AgentStrategyApiService } from '@genfeedai/agent/services/agent-strategy-api.service';
import { useAgentStrategyStore } from '@genfeedai/agent/stores/agent-strategy.store';
import { ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import {
  formatCreditBalanceExact,
  formatCreditCost,
} from '@genfeedai/contracts/constants';
import { Alert } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Progress } from '@ui/primitives/progress';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useId, useRef, useState } from 'react';

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
  const translate = useTranslations('agent.strategyStatus');
  const strategy = useAgentStrategyStore((s) => s.strategy);
  const setStrategy = useAgentStrategyStore((s) => s.setStrategy);
  const abortRef = useRef<AbortController | null>(null);
  const dailyLabelId = useId();
  const weeklyLabelId = useId();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleEnabled = useCallback(async () => {
    if (!strategy || isToggling) {
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsToggling(true);

    try {
      const updated = await apiService.updateStrategy(
        strategy.id,
        { isEnabled: !strategy.isEnabled },
        abortRef.current.signal,
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
      await apiService.runNow(strategy.id, abortRef.current.signal);
    } catch {
      // Silently ignore aborted/failed requests
    }
  }, [strategy, apiService]);

  if (!strategy) {
    return (
      <EmptyState
        description={translate('emptyDescription')}
        size={CardEmptySize.SM}
        surface="card"
        title={translate('emptyTitle')}
      />
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
          {!strategy.isEnabled && <Badge variant="secondary">Paused</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              strategy.isActive && strategy.isEnabled ? 'success' : 'secondary'
            }
          >
            {strategy.isActive && strategy.isEnabled ? 'Active' : 'Inactive'}
          </Badge>
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
              className={`pointer-events-none inline-block size-4 rounded-full bg-background shadow-sm transition-transform ${
                strategy.isEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </Button>
        </div>
      </div>

      {/* Timing */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-2xs text-muted-foreground">Last run</p>
          <p className="text-xs font-medium text-foreground">
            {strategy.lastRunAt
              ? formatRelativeTime(strategy.lastRunAt)
              : 'Never'}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-2xs text-muted-foreground">Next run</p>
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
          <p className="text-2xs text-muted-foreground" id={dailyLabelId}>
            Daily credits
          </p>
          <p className="text-2xs text-muted-foreground">
            {formatCreditCost(strategy.creditsUsedToday)} /{' '}
            {formatCreditBalanceExact(strategy.dailyCreditBudget)}
          </p>
        </div>
        <Progress
          aria-labelledby={dailyLabelId}
          size="sm"
          tone={dailyPercent >= 90 ? 'destructive' : 'primary'}
          value={dailyPercent}
        />
      </div>

      {/* Weekly budget */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-2xs text-muted-foreground" id={weeklyLabelId}>
            Weekly credits
          </p>
          <p className="text-2xs text-muted-foreground">
            {formatCreditCost(strategy.creditsUsedThisWeek)} /{' '}
            {formatCreditBalanceExact(strategy.weeklyCreditBudget)}
          </p>
        </div>
        <Progress
          aria-labelledby={weeklyLabelId}
          size="sm"
          tone={weeklyPercent >= 90 ? 'destructive' : 'primary'}
          value={weeklyPercent}
        />
      </div>

      {/* Consecutive failures warning */}
      {strategy.consecutiveFailures > 0 && (
        <Alert size="sm" variant="destructive">
          {strategy.consecutiveFailures} consecutive failure
          {strategy.consecutiveFailures > 1 ? 's' : ''}
        </Alert>
      )}

      {/* Run Now */}
      <Button
        variant={ButtonVariant.SECONDARY}
        onClick={handleRunNow}
        isDisabled={!strategy.isActive || !strategy.isEnabled}
        className="w-full"
      >
        Run Now
      </Button>
    </div>
  );
}
