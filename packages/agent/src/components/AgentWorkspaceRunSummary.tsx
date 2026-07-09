import type { AgentRunSummary } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineBolt,
  HiOutlineNoSymbol,
  HiOutlinePlayCircle,
} from 'react-icons/hi2';

interface AgentWorkspaceRunSummaryProps {
  apiService: AgentApiService;
  authReady?: boolean;
  onOpenThread?: (threadId: string) => void;
}

function formatRunStatus(status: string): string {
  return status
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getRunStatusClassName(status: string): string {
  switch (status.toUpperCase()) {
    case 'RUNNING':
      return 'bg-primary/10 text-primary';
    case 'PENDING':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    case 'CANCELLED':
      return 'bg-foreground/10 text-foreground/60';
    case 'FAILED':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-green-500/10 text-green-600 dark:text-green-400';
  }
}

function isRunCancellable(status: string): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

function getRunThreadId(run: AgentRunSummary): string | null {
  return typeof run.thread === 'string' && run.thread.length > 0
    ? run.thread
    : null;
}

function formatStartedAt(startedAt?: string): string {
  if (!startedAt) {
    return 'Queued';
  }

  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) {
    return 'Started recently';
  }

  const diffMs = Date.now() - started.getTime();
  const diffMins = Math.max(0, Math.floor(diffMs / 60_000));
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) {
    return 'Started just now';
  }
  if (diffMins < 60) {
    return `Started ${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `Started ${diffHours}h ago`;
  }
  return `Started ${started.toLocaleDateString()}`;
}

export function AgentWorkspaceRunSummary({
  apiService,
  authReady = true,
  onOpenThread,
}: AgentWorkspaceRunSummaryProps): ReactElement {
  const [runs, setRuns] = useState<AgentRunSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const activeRuns = await runAgentApiEffect(
          apiService.getActiveRunsEffect(signal),
        );
        if (!signal?.aborted) {
          setRuns(activeRuns);
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to load active runs.',
        );
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [apiService],
  );

  useEffect(() => {
    if (!authReady) {
      return;
    }

    const controller = new AbortController();
    void loadRuns(controller.signal);

    return () => controller.abort();
  }, [authReady, loadRuns]);

  const activeRunCount = useMemo(
    () => runs.filter((run) => isRunCancellable(run.status)).length,
    [runs],
  );
  const isRunSummaryLoading = !authReady || isLoading;

  const handleCancelRun = useCallback(
    async (runId: string) => {
      setCancellingRunId(runId);
      setLoadError(null);

      try {
        const cancelledRun = await runAgentApiEffect(
          apiService.cancelRunEffect(runId),
        );
        setRuns((currentRuns) =>
          currentRuns.map((run) =>
            run.id === cancelledRun.id ? cancelledRun : run,
          ),
        );
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : 'Failed to cancel active run.',
        );
      } finally {
        setCancellingRunId(null);
      }
    },
    [apiService],
  );

  return (
    <section className="border-b border-border bg-background-secondary px-4 py-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <HiOutlineBolt className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active Runs
            </p>
            <h2 className="truncate text-sm font-semibold text-foreground">
              {isRunSummaryLoading
                ? 'Checking current work'
                : activeRunCount > 0
                  ? `${activeRunCount} run${activeRunCount === 1 ? '' : 's'} in flight`
                  : 'No active runs'}
            </h2>
          </div>
        </div>

        {loadError ? (
          <div className="flex items-center gap-2 text-xs text-destructive">
            <span className="line-clamp-1">{loadError}</span>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.XS}
              withWrapper={false}
              onClick={() => void loadRuns()}
            >
              Retry
            </Button>
          </div>
        ) : null}
      </div>

      {isRunSummaryLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading active runs
        </div>
      ) : null}

      {!isRunSummaryLoading && !loadError && runs.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          New agent work will appear here while it is queued or running.
        </p>
      ) : null}

      {!isRunSummaryLoading && runs.length > 0 ? (
        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {runs.map((run) => {
            const threadId = getRunThreadId(run);
            const isCancelling = cancellingRunId === run.id;
            return (
              <div
                key={run.id}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        getRunStatusClassName(run.status),
                      )}
                    >
                      {formatRunStatus(run.status)}
                    </span>
                    <p className="truncate text-xs font-medium text-foreground">
                      {run.label}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatStartedAt(run.startedAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {threadId && onOpenThread ? (
                    <Button
                      ariaLabel={`Open ${run.label} thread`}
                      variant={ButtonVariant.OUTLINE}
                      size={ButtonSize.XS}
                      withWrapper={false}
                      onClick={() => onOpenThread(threadId)}
                    >
                      <HiOutlinePlayCircle className="size-3.5" />
                      Open
                    </Button>
                  ) : null}
                  {isRunCancellable(run.status) ? (
                    <Button
                      ariaLabel={`Cancel ${run.label}`}
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.XS}
                      withWrapper={false}
                      isLoading={isCancelling}
                      onClick={() => void handleCancelRun(run.id)}
                    >
                      <HiOutlineNoSymbol className="size-3.5" />
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!isRunSummaryLoading && runs.length > 0 ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => void loadRuns()}
        >
          <HiOutlineArrowPath className="size-3.5" />
          Refresh runs
        </Button>
      ) : null}
    </section>
  );
}
