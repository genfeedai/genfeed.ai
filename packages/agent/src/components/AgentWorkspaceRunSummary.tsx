import type {
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
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
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
  HiOutlineNoSymbol,
  HiOutlinePlayCircle,
} from 'react-icons/hi2';

const PAGE_SIZE = 10;

interface AgentWorkspaceRunSummaryProps {
  apiService: AgentApiService;
  authReady?: boolean;
  brandId?: string | null;
  onOpenThread?: (threadId: string) => void;
}

function normalizeStatus(status?: string): string {
  return status?.trim().toUpperCase() || 'UNKNOWN';
}

function formatRunStatus(status?: string): string {
  return normalizeStatus(status)
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function getRunStatusClassName(status?: string): string {
  switch (normalizeStatus(status)) {
    case 'RUNNING':
      return 'bg-info/10 text-info';
    case 'PENDING':
      return 'bg-warning/10 text-warning';
    case 'FAILED':
      return 'bg-destructive/10 text-destructive';
    case 'COMPLETED':
      return 'bg-success/10 text-success';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function isRunCancellable(status?: string): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'PENDING' || normalized === 'RUNNING';
}

function isRunRetryable(status?: string): boolean {
  const normalized = normalizeStatus(status);
  return normalized === 'CANCELLED' || normalized === 'FAILED';
}

function getRunThreadId(run: AgentRunSummary): string | null {
  return typeof run.thread === 'string' && run.thread.length > 0
    ? run.thread
    : null;
}

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return 'Not started';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number') {
    return '—';
  }

  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }

  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readAgentScopeString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const scope = metadata?.agentScope;
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
    return null;
  }

  const value = (scope as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function AgentRunStatusBadge({ status }: { status?: string }): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
        getRunStatusClassName(status),
      )}
    >
      {formatRunStatus(status)}
    </span>
  );
}

function AgentRunDetail({
  actionRunId,
  detailError,
  isLoading,
  onCancel,
  onOpenThread,
  onReload,
  onRetry,
  run,
}: {
  actionRunId: string | null;
  detailError: string | null;
  isLoading: boolean;
  onCancel: (runId: string) => void;
  onOpenThread?: (threadId: string) => void;
  onReload: () => void;
  onRetry: (runId: string) => void;
  run: AgentRunSummary | null;
}): ReactElement {
  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center" role="status">
        <HiOutlineArrowPath
          aria-hidden="true"
          className="size-5 animate-spin text-primary"
        />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading run detail
        </span>
      </div>
    );
  }

  if (detailError && !run) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-sm text-destructive" role="alert">
          {detailError}
        </p>
        <Button
          size={ButtonSize.XS}
          variant={ButtonVariant.OUTLINE}
          withWrapper={false}
          onClick={onReload}
        >
          Retry detail
        </Button>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex min-h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select a run to inspect its execution details.
      </div>
    );
  }

  const threadId = getRunThreadId(run);
  const model =
    readMetadataString(run.metadata, 'actualModel') ??
    readMetadataString(run.metadata, 'requestedModel') ??
    readMetadataString(run.metadata, 'model');
  const source = readMetadataString(run.metadata, 'source');
  const scopedBrandId =
    (typeof run.brand === 'string' ? run.brand : null) ??
    readAgentScopeString(run.metadata, 'brandId');
  const progress = Math.min(100, Math.max(0, run.progress ?? 0));
  const isActing = actionRunId === run.id;

  return (
    <article aria-labelledby={`agent-run-${run.id}-title`} className="p-4">
      {detailError ? (
        <div
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {detailError}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <AgentRunStatusBadge status={run.status} />
          <h3
            className="mt-2 break-words text-base font-semibold text-foreground"
            id={`agent-run-${run.id}-title`}
          >
            {run.label || 'Untitled run'}
          </h3>
          {run.objective ? (
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
              {run.objective}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {threadId && onOpenThread ? (
            <Button
              ariaLabel={`Open ${run.label} thread`}
              size={ButtonSize.XS}
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={() => onOpenThread(threadId)}
            >
              <HiOutlinePlayCircle aria-hidden="true" className="size-4" />
              Open thread
            </Button>
          ) : null}
          {isRunCancellable(run.status) ? (
            <Button
              ariaLabel={`Cancel ${run.label}`}
              isLoading={isActing}
              size={ButtonSize.XS}
              variant={ButtonVariant.DESTRUCTIVE}
              withWrapper={false}
              onClick={() => onCancel(run.id)}
            >
              <HiOutlineNoSymbol aria-hidden="true" className="size-4" />
              Cancel
            </Button>
          ) : null}
          {isRunRetryable(run.status) ? (
            <Button
              ariaLabel={`Retry ${run.label}`}
              isLoading={isActing}
              size={ButtonSize.XS}
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={() => onRetry(run.id)}
            >
              <HiOutlineArrowPath aria-hidden="true" className="size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div
          aria-label="Run progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {run.error ? (
        <div
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <p className="font-semibold">Run failed</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{run.error}</p>
        </div>
      ) : null}

      <section aria-labelledby={`agent-run-${run.id}-provenance`}>
        <h4
          className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          id={`agent-run-${run.id}-provenance`}
        >
          Provenance
        </h4>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 text-sm lg:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="mt-0.5 text-foreground">
              {formatTimestamp(run.startedAt ?? run.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Duration</dt>
            <dd className="mt-0.5 text-foreground">
              {formatDuration(run.durationMs)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Trigger</dt>
            <dd className="mt-0.5 text-foreground">
              {formatRunStatus(run.trigger)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Model</dt>
            <dd className="mt-0.5 break-words text-foreground">
              {model ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Source</dt>
            <dd className="mt-0.5 break-words text-foreground">
              {source ?? 'Agent workspace'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Brand scope</dt>
            <dd className="mt-0.5 break-all text-foreground">
              {scopedBrandId ?? 'Organization-wide'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Thread</dt>
            <dd className="mt-0.5 break-all text-foreground">
              {threadId ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Credits</dt>
            <dd className="mt-0.5 text-foreground">
              {run.creditsUsed ?? 0}
              {typeof run.creditBudget === 'number'
                ? ` / ${run.creditBudget}`
                : ''}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Retries</dt>
            <dd className="mt-0.5 text-foreground">{run.retryCount ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Artifacts</dt>
            <dd className="mt-0.5 text-foreground">
              {run.artifactReferences?.length ?? 0}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby={`agent-run-${run.id}-steps`}>
          <h4
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            id={`agent-run-${run.id}-steps`}
          >
            Steps
          </h4>
          {run.steps?.length ? (
            <ol className="mt-2 space-y-2">
              {run.steps.map((step, index) => (
                <li
                  className="border-l-2 border-border pl-3 text-sm"
                  key={step.id ?? `${run.id}-step-${index}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {step.label || `Step ${index + 1}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatRunStatus(step.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDuration(step.durationMs)}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No step timeline was recorded for this run.
            </p>
          )}
        </section>

        <section aria-labelledby={`agent-run-${run.id}-tools`}>
          <h4
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            id={`agent-run-${run.id}-tools`}
          >
            Tool activity
          </h4>
          {run.toolCalls?.length ? (
            <ol className="mt-2 space-y-2">
              {run.toolCalls.map((toolCall, index) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm"
                  key={`${run.id}-tool-${toolCall.toolName ?? 'unknown'}-${index}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {toolCall.toolName || 'Unknown tool'}
                    </p>
                    {toolCall.error ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-destructive">
                        {toolCall.error}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p>{formatRunStatus(toolCall.status)}</p>
                    <p>{formatDuration(toolCall.durationMs)}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              This run did not record any tool activity.
            </p>
          )}
        </section>
      </div>
    </article>
  );
}

export function AgentWorkspaceRunSummary({
  apiService,
  authReady = true,
  brandId,
  onOpenThread,
}: AgentWorkspaceRunSummaryProps): ReactElement {
  const [page, setPage] = useState(1);
  const [scopeBrandId, setScopeBrandId] = useState(brandId);
  const [runPage, setRunPage] = useState<AgentRunPage | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AgentRunSummary | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionRunId, setActionRunId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadRuns = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const nextPage = await runAgentApiEffect(
          apiService.listRunsEffect(
            { brandId: scopeBrandId ?? undefined, limit: PAGE_SIZE, page },
            signal,
          ),
        );
        if (signal?.aborted) {
          return;
        }

        setRunPage(nextPage);
        setSelectedRunId((currentId) => {
          if (currentId && nextPage.runs.some((run) => run.id === currentId)) {
            return currentId;
          }
          return nextPage.runs[0]?.id ?? null;
        });
      } catch (error) {
        if (!signal?.aborted) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load runs.',
          );
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [apiService, page, scopeBrandId],
  );

  useEffect(() => {
    setScopeBrandId(brandId);
    setPage(1);
    setSelectedRunId(null);
    setSelectedRun(null);
  }, [brandId]);

  useEffect(() => {
    if (!authReady || !isExpanded) {
      return;
    }

    const controller = new AbortController();
    void loadRuns(controller.signal);
    return () => controller.abort();
  }, [authReady, isExpanded, loadRuns]);

  const loadRunDetail = useCallback(
    async (signal?: AbortSignal) => {
      if (!authReady || !selectedRunId || !isExpanded) {
        setSelectedRun(null);
        setDetailError(null);
        return;
      }

      setIsDetailLoading(true);
      setSelectedRun(null);
      setDetailError(null);
      try {
        const run = await runAgentApiEffect(
          apiService.getRunEffect(
            selectedRunId,
            scopeBrandId ?? undefined,
            signal,
          ),
        );
        if (!signal?.aborted) {
          setSelectedRun(run);
        }
      } catch (error) {
        if (!signal?.aborted) {
          setDetailError(
            error instanceof Error
              ? error.message
              : 'Failed to load run detail.',
          );
        }
      } finally {
        if (!signal?.aborted) {
          setIsDetailLoading(false);
        }
      }
    },
    [apiService, authReady, isExpanded, scopeBrandId, selectedRunId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadRunDetail(controller.signal);
    return () => controller.abort();
  }, [loadRunDetail]);

  const activeRunCount = useMemo(
    () =>
      runPage?.runs.filter((run) => isRunCancellable(run.status)).length ?? 0,
    [runPage],
  );
  const totalRuns = runPage?.pagination.total ?? runPage?.runs.length ?? 0;
  const totalPages = Math.max(1, runPage?.pagination.pages ?? 1);

  const applyRunAction = useCallback(
    async (runId: string, action: 'cancel' | 'retry') => {
      setActionRunId(runId);
      setActionMessage(null);
      setDetailError(null);

      try {
        const run = await runAgentApiEffect(
          action === 'cancel'
            ? apiService.cancelRunEffect(
                runId,
                undefined,
                scopeBrandId ?? undefined,
              )
            : apiService.retryRunEffect(
                runId,
                undefined,
                scopeBrandId ?? undefined,
              ),
        );
        setSelectedRun(run);
        setRunPage((currentPage) =>
          currentPage
            ? {
                ...currentPage,
                runs: currentPage.runs.map((currentRun) =>
                  currentRun.id === run.id ? run : currentRun,
                ),
              }
            : currentPage,
        );
        setActionMessage(
          action === 'cancel'
            ? `${run.label} was cancelled.`
            : `${run.label} was queued for retry.`,
        );
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : `Failed to ${action} agent run.`,
        );
      } finally {
        setActionRunId(null);
      }
    },
    [apiService, scopeBrandId],
  );

  return (
    <section
      aria-labelledby="agent-operator-heading"
      className="shrink-0 border-b border-border bg-background-secondary"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
            <HiOutlineBolt aria-hidden="true" className="size-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent operations
            </p>
            <h2
              className="truncate text-sm font-semibold text-foreground"
              id="agent-operator-heading"
            >
              {!authReady || isLoading
                ? 'Loading run workspace'
                : `${totalRuns} run${totalRuns === 1 ? '' : 's'} · ${activeRunCount} active on page`}
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isExpanded && runPage?.runs.length ? (
            <Button
              ariaLabel="Refresh agent runs"
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() => void loadRuns()}
            >
              <HiOutlineArrowPath aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          ) : null}
          <Button
            aria-controls="agent-operator-content"
            aria-expanded={isExpanded}
            ariaLabel={
              isExpanded
                ? 'Collapse agent operations'
                : 'Expand agent operations'
            }
            size={ButtonSize.XS}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
            onClick={() => setIsExpanded((current) => !current)}
          >
            {isExpanded ? (
              <HiOutlineChevronUp aria-hidden="true" className="size-4" />
            ) : (
              <HiOutlineChevronDown aria-hidden="true" className="size-4" />
            )}
          </Button>
        </div>
      </div>

      {isExpanded ? (
        <div
          className="max-h-[55vh] overflow-y-auto border-t border-border lg:max-h-[28rem]"
          id="agent-operator-content"
        >
          <p aria-live="polite" className="sr-only" role="status">
            {actionMessage}
          </p>

          {!authReady || isLoading ? (
            <div
              className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <HiOutlineArrowPath
                aria-hidden="true"
                className="size-5 animate-spin text-primary"
              />
              Loading agent runs
            </div>
          ) : null}

          {!isLoading && loadError ? (
            <div
              className="flex min-h-40 flex-col items-center justify-center gap-3 p-4 text-center"
              role="alert"
            >
              <p className="text-sm text-destructive">{loadError}</p>
              <Button
                size={ButtonSize.XS}
                variant={ButtonVariant.OUTLINE}
                withWrapper={false}
                onClick={() => void loadRuns()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {!isLoading && !loadError && runPage?.runs.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                No agent runs yet
              </p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Runs from this workspace will appear here with their status,
                provenance, steps, and tool activity.
              </p>
            </div>
          ) : null}

          {!isLoading && !loadError && runPage?.runs.length ? (
            <div className="grid lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.8fr)]">
              <div className="border-b border-border lg:border-r lg:border-b-0">
                <h3 className="sr-only">Agent run history</h3>
                <ol
                  aria-label="Agent run history"
                  className="divide-y divide-border"
                >
                  {runPage.runs.map((run) => (
                    <li key={run.id}>
                      <Button
                        aria-pressed={selectedRunId === run.id}
                        className={cn(
                          'flex w-full items-start justify-between gap-3 rounded-none px-4 py-3 text-left hover:bg-muted/60 focus-visible:z-10',
                          selectedRunId === run.id && 'bg-muted',
                        )}
                        variant={ButtonVariant.UNSTYLED}
                        withWrapper={false}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {run.label || 'Untitled run'}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {formatTimestamp(run.startedAt ?? run.createdAt)}
                          </p>
                        </div>
                        <AgentRunStatusBadge status={run.status} />
                      </Button>
                    </li>
                  ))}
                </ol>

                <nav
                  aria-label="Agent run history pages"
                  className="flex items-center justify-between gap-2 border-t border-border px-3 py-2"
                >
                  <Button
                    ariaLabel="Previous run page"
                    isDisabled={page <= 1}
                    size={ButtonSize.XS}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                  >
                    <HiOutlineChevronLeft
                      aria-hidden="true"
                      className="size-4"
                    />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    ariaLabel="Next run page"
                    isDisabled={page >= totalPages}
                    size={ButtonSize.XS}
                    variant={ButtonVariant.GHOST}
                    withWrapper={false}
                    onClick={() =>
                      setPage((current) => Math.min(totalPages, current + 1))
                    }
                  >
                    Next
                    <HiOutlineChevronRight
                      aria-hidden="true"
                      className="size-4"
                    />
                  </Button>
                </nav>
              </div>

              <AgentRunDetail
                actionRunId={actionRunId}
                detailError={detailError}
                isLoading={isDetailLoading}
                run={selectedRun}
                onCancel={(runId) => void applyRunAction(runId, 'cancel')}
                onOpenThread={onOpenThread}
                onReload={() => void loadRunDetail()}
                onRetry={(runId) => void applyRunAction(runId, 'retry')}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
