'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  selectUpdateNodeData,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createWorkflowApiService,
  type ExecutionNodeResult,
  type ExecutionResult,
} from '@/features/workflows/services/workflow-api';
import { getExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import { buildExecutionNodePatches } from '@/features/workflows/utils/execution-node-sync';
import {
  getStatusColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

interface ExecutionPanelProps {
  workflowId: string;
  runId?: string;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 2500;
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

/**
 * ExecutionPanel - Side panel showing real-time execution status and logs
 */
export function ExecutionPanel({
  workflowId,
  runId,
  onClose,
}: ExecutionPanelProps) {
  const [execution, setExecution] = useState<ExecutionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const updateNodeData = useWorkflowStore(selectUpdateNodeData);

  const getService = useAuthedService(
    createWorkflowApiService,
    EnvironmentService.JWT_LABEL,
  );
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const etaDisplay = getExecutionEtaDisplayState({
    durationMs: execution?.durationMs,
    eta: execution?.metadata?.eta,
    status: execution?.status ?? 'pending',
  });

  const fetchExecution = useCallback(
    async (signal: AbortSignal) => {
      if (!runId) {
        setIsLoading(false);
        return;
      }

      try {
        const service = await getService();
        if (signal.aborted) {
          return;
        }

        const data = await service.getExecution(runId);
        if (signal.aborted) {
          return;
        }

        setExecution(data);
        for (const patch of buildExecutionNodePatches(data)) {
          updateNodeData(patch.nodeId, patch.patch);
        }
        setError(null);

        return data;
      } catch (err) {
        if (signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load execution';
        logger.error('Failed to fetch execution', {
          error: err,
          executionId: runId,
        });
        setError(message);
        return null;
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [runId, getService, updateNodeData],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const poll = async () => {
      const data = await fetchExecution(signal);
      if (signal.aborted) {
        return;
      }

      if (data && !TERMINAL_STATUSES.has(data.status)) {
        pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    setIsLoading(true);
    poll();

    return () => {
      controller.abort();
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchExecution]);

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 border-l border-white/[0.08] bg-card shadow-xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <h2 className="font-semibold">Execution</h2>
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          onClick={onClose}
          tooltip="Close"
        >
          ✕
        </Button>
      </div>

      <div className="h-[calc(100%-56px)] overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-pulse">Loading...</div>
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant={ButtonVariant.OUTLINE}
              onClick={() => {
                const controller = new AbortController();
                setIsLoading(true);
                fetchExecution(controller.signal);
              }}
              className="w-full"
            >
              Retry
            </Button>
          </div>
        ) : execution ? (
          <div className="space-y-4">
            <div className=" border border-white/[0.08] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <span
                  className={`font-medium ${getStatusColor(execution.status)}`}
                >
                  {getStatusIcon(execution.status)} {execution.status}
                </span>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="font-medium">{execution.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${execution.progress}%` }}
                />
              </div>
              {etaDisplay.phaseLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {etaDisplay.phaseLabel}
                </p>
              )}
            </div>

            <div className=" border border-white/[0.08] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trigger</span>
                <span className="text-sm capitalize">{execution.trigger}</span>
              </div>
              {etaDisplay.etaLabel && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ETA</span>
                  <span className="text-sm">{etaDisplay.etaLabel}</span>
                </div>
              )}
              {etaDisplay.elapsedLabel && execution.status !== 'completed' && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Elapsed</span>
                  <span className="text-sm">{etaDisplay.elapsedLabel}</span>
                </div>
              )}
              {etaDisplay.actualDurationLabel && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Actual duration
                  </span>
                  <span className="text-sm">
                    {etaDisplay.actualDurationLabel}
                  </span>
                </div>
              )}
              {etaDisplay.reassuranceLabel && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {etaDisplay.reassuranceLabel}
                </p>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Node Results</h3>
              {execution.nodeResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No nodes executed yet
                </p>
              ) : (
                <div className="space-y-2">
                  {execution.nodeResults.map((result: ExecutionNodeResult) => (
                    <div
                      key={result.nodeId}
                      className=" border border-white/[0.08] p-3"
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{result.nodeId}</span>
                        <span className={getStatusColor(result.status)}>
                          {getStatusIcon(result.status)}
                        </span>
                      </div>
                      {result.error && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {result.error}
                        </p>
                      )}
                      {result.progress != null && result.progress < 100 && (
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${result.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {execution.error && (
              <div className=" border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <p className="text-sm text-red-800 dark:text-red-200">
                  {execution.error}
                </p>
              </div>
            )}

            {execution.status === 'failed' && (
              <Button variant={ButtonVariant.DEFAULT} className="w-full">
                Resume from Failed Node
              </Button>
            )}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">No execution data</p>
        )}
      </div>
    </div>
  );
}
