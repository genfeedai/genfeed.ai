import {
  AgentRunStatusBadge,
  AgentWorkspaceRunDetail,
} from '@genfeedai/agent/components/AgentWorkspaceRunDetail';
import type {
  AgentRunPage,
  AgentRunSummary,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { runAgentApiEffect } from '@genfeedai/agent/services/agent-base-api.service';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { getErrorMessage } from '@genfeedai/utils/error/error-handler.util';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineBolt,
  HiOutlineChevronDown,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronUp,
} from 'react-icons/hi2';
import {
  type AgentRunAction,
  formatRunTimestamp,
  getRunActionEffect,
  getRunActionMessage,
  isRunCancellable,
  isRunDetailLoadable,
  replaceRunInPage,
  selectRunId,
  updateIfRequestActive,
} from './agent-workspace-run.helpers';

const PAGE_SIZE = 10;

interface AgentWorkspaceRunSummaryProps {
  apiService: AgentApiService;
  authReady?: boolean;
  brandId?: string | null;
  onOpenThread?: (threadId: string) => void;
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
  const runsRequestRef = useRef<AbortController | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);
  const actionRequestRef = useRef<AbortController | null>(null);

  if (brandId !== scopeBrandId) {
    setScopeBrandId(brandId);
    setPage(1);
    setSelectedRunId(null);
    setSelectedRun(null);
  }

  const loadRuns = useCallback((): Promise<void> => {
    runsRequestRef.current?.abort();
    const controller = new AbortController();
    runsRequestRef.current = controller;
    setIsLoading(true);
    setLoadError(null);

    return runAgentApiEffect(
      apiService.listRunsEffect(
        { brandId: scopeBrandId ?? undefined, limit: PAGE_SIZE, page },
        controller.signal,
      ),
    )
      .then(
        (nextPage) =>
          updateIfRequestActive(controller.signal, () => {
            setRunPage(nextPage);
            setSelectedRunId((currentId) =>
              selectRunId(currentId, nextPage.runs),
            );
          }),
        (error) =>
          updateIfRequestActive(controller.signal, () =>
            setLoadError(getErrorMessage(error, 'Failed to load runs.')),
          ),
      )
      .finally(() => {
        updateIfRequestActive(controller.signal, () => setIsLoading(false));
        if (runsRequestRef.current === controller) {
          runsRequestRef.current = null;
        }
      });
  }, [apiService, page, scopeBrandId]);

  useEffect(() => {
    if (!authReady || !isExpanded) {
      return;
    }

    void loadRuns();
    return () => runsRequestRef.current?.abort();
  }, [authReady, isExpanded, loadRuns]);

  const loadRunDetail = useCallback((): Promise<void> => {
    detailRequestRef.current?.abort();
    if (!isRunDetailLoadable(authReady, isExpanded, selectedRunId)) {
      setSelectedRun(null);
      setDetailError(null);
      return Promise.resolve();
    }

    const controller = new AbortController();
    detailRequestRef.current = controller;
    setIsDetailLoading(true);
    setSelectedRun(null);
    setDetailError(null);
    return runAgentApiEffect(
      apiService.getRunEffect(
        selectedRunId,
        scopeBrandId ?? undefined,
        controller.signal,
      ),
    )
      .then(
        (run) =>
          updateIfRequestActive(controller.signal, () => setSelectedRun(run)),
        (error) =>
          updateIfRequestActive(controller.signal, () =>
            setDetailError(
              getErrorMessage(error, 'Failed to load run detail.'),
            ),
          ),
      )
      .finally(() => {
        updateIfRequestActive(controller.signal, () =>
          setIsDetailLoading(false),
        );
        if (detailRequestRef.current === controller) {
          detailRequestRef.current = null;
        }
      });
  }, [apiService, authReady, isExpanded, scopeBrandId, selectedRunId]);

  useEffect(() => {
    void loadRunDetail();
    return () => detailRequestRef.current?.abort();
  }, [loadRunDetail]);

  const activeRunCount = useMemo(
    () =>
      runPage?.runs.filter((run) => isRunCancellable(run.status)).length ?? 0,
    [runPage],
  );
  const totalRuns = runPage?.pagination.total ?? runPage?.runs.length ?? 0;
  const totalPages = Math.max(1, runPage?.pagination.pages ?? 1);

  const applyRunAction = useCallback(
    (runId: string, action: AgentRunAction): Promise<void> => {
      actionRequestRef.current?.abort();
      const controller = new AbortController();
      actionRequestRef.current = controller;
      setActionRunId(runId);
      setActionMessage(null);
      setDetailError(null);

      return runAgentApiEffect(
        getRunActionEffect(
          apiService,
          action,
          runId,
          scopeBrandId ?? undefined,
          controller.signal,
        ),
      )
        .then(
          (run) => {
            if (controller.signal.aborted) {
              return;
            }
            setSelectedRun((currentRun) =>
              currentRun?.id === run.id ? run : currentRun,
            );
            setRunPage((currentPage) => replaceRunInPage(currentPage, run));
            setActionMessage(getRunActionMessage(action, run));
          },
          (error) => {
            if (controller.signal.aborted) {
              return;
            }
            setDetailError(
              getErrorMessage(error, `Failed to ${action} agent run.`),
            );
          },
        )
        .finally(() => {
          if (actionRequestRef.current === controller) {
            actionRequestRef.current = null;
            setActionRunId(null);
          }
        });
    },
    [apiService, scopeBrandId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: changing brand scope must abort any in-flight action.
  useEffect(
    () => () => {
      actionRequestRef.current?.abort();
    },
    [scopeBrandId],
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
                            {formatRunTimestamp(run.startedAt ?? run.createdAt)}
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

              <AgentWorkspaceRunDetail
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
