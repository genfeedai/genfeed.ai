'use client';

import { ButtonVariant, WorkflowExecutionStatus } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  ExecutionNodeResult,
  ExecutionResult,
} from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { getExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import {
  getStatusBorderColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

interface ExecutionLogsProps {
  executionId: string;
}

interface NodeResult {
  nodeId: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  output?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  retryCount: number;
  creditsUsed: number;
}

interface ExecutionDetail {
  runId: string;
  workflowId: string;
  workflowLabel: string;
  status: WorkflowExecutionStatus;
  nodeResults: NodeResult[];
  totalCreditsUsed: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  durationMs?: number;
  metadata?: ExecutionResult['metadata'];
}

/**
 * Execution Detail Page - Shows detailed logs for a specific run
 */
function mapNodeResult(node: ExecutionNodeResult): NodeResult {
  return {
    completedAt: node.completedAt,
    creditsUsed: 0,
    error: node.error,
    nodeId: node.nodeId,
    nodeLabel: node.nodeType,
    output: node.output,
    retryCount: 0,
    startedAt: node.startedAt || new Date().toISOString(),
    status:
      (node.status as NodeResult['status']) || WorkflowExecutionStatus.PENDING,
  };
}

function mapExecution(result: ExecutionResult): ExecutionDetail {
  const workflowId =
    typeof result.workflow === 'string' ? result.workflow : result.workflow._id;
  const workflowLabel =
    typeof result.workflow === 'string'
      ? result.workflow
      : result.workflow.label || result.workflow._id;

  return {
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    error: result.error,
    metadata: result.metadata,
    nodeResults: (result.nodeResults || []).map(mapNodeResult),
    runId: result._id,
    startedAt: result.startedAt || result.createdAt,
    status:
      (result.status as WorkflowExecutionStatus) ||
      WorkflowExecutionStatus.PENDING,
    totalCreditsUsed:
      typeof result.metadata?.creditsUsed === 'number'
        ? result.metadata.creditsUsed
        : 0,
    workflowId,
    workflowLabel,
  };
}

export default function ExecutionDetailPage({
  executionId: runId,
}: ExecutionLogsProps) {
  const [execution, setExecution] = useState<ExecutionDetail | null>(null);
  const { href } = useOrgUrl();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const getService = useAuthedService(createWorkflowApiService);

  useEffect(() => {
    const controller = new AbortController();

    const fetchExecution = async () => {
      if (!runId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (controller.signal.aborted) {
          return;
        }
        const result = await service.getExecution(runId);
        if (controller.signal.aborted) {
          return;
        }
        setExecution(mapExecution(result));
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load execution details',
        );
        logger.error('Failed to load execution details', { err, runId });
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchExecution();
    return () => controller.abort();
  }, [getService, runId]);

  const toggleNodeExpand = (nodeId: string): void => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse">Loading execution logs...</div>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="mb-4 text-2xl font-bold">Execution Failed To Load</h1>
        <p className="mb-6 text-muted-foreground">{error}</p>
        <Link
          href={href('/workflows/executions')}
          className=" bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
        >
          Back to History
        </Link>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="mb-4 text-2xl font-bold">Execution Not Found</h1>
        <p className="mb-6 text-muted-foreground">
          The execution run you're looking for doesn't exist.
        </p>
        <Link
          href={href('/workflows/executions')}
          className=" bg-primary px-6 py-3 text-primary-foreground hover:bg-primary/90"
        >
          Back to History
        </Link>
      </div>
    );
  }

  const startedAt = new Date(execution.startedAt);
  const completedAt = execution.completedAt
    ? new Date(execution.completedAt)
    : null;
  const duration = completedAt
    ? Math.round((completedAt.getTime() - startedAt.getTime()) / 1000)
    : null;
  const etaDisplay = getExecutionEtaDisplayState({
    durationMs: execution.durationMs,
    eta: execution.metadata?.eta,
    status: execution.status,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-white/[0.08] bg-card px-6 py-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Link
              href={href('/workflows/executions')}
              className="hover:text-foreground"
            >
              Executions
            </Link>
            <span>/</span>
            <span>{runId.slice(0, 8)}...</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{execution.workflowLabel}</h1>
              <p className="text-sm text-muted-foreground">
                Run ID: {execution.runId}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href={href(
                  `/workflows/${execution.workflowId}?execution=${execution.runId}`,
                )}
                className=" border border-white/[0.08] px-4 py-2 hover:bg-accent"
              >
                View Workflow
              </Link>
              {execution.status === WorkflowExecutionStatus.FAILED && (
                <Button variant={ButtonVariant.DEFAULT}>
                  Resume Execution
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Summary */}
      <div className="border-b border-white/[0.08] bg-card/50 px-6 py-4">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="flex items-center gap-1 font-semibold">
              {getStatusIcon(execution.status)} {execution.status}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Phase</div>
            <div className="font-semibold">
              {etaDisplay.phaseLabel ?? 'Queued'}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Started</div>
            <div className="font-semibold">{startedAt.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Timing</div>
            <div className="font-semibold">
              {etaDisplay.actualDurationLabel ??
                (duration !== null ? `${duration}s` : 'In progress')}
            </div>
            {etaDisplay.elapsedLabel && execution.status !== 'completed' && (
              <div className="text-xs text-muted-foreground">
                Elapsed {etaDisplay.elapsedLabel}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">ETA</div>
            <div className="font-semibold">{etaDisplay.etaLabel ?? '—'}</div>
            {etaDisplay.reassuranceLabel && (
              <div className="text-xs text-muted-foreground">
                {etaDisplay.reassuranceLabel}
              </div>
            )}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Credits Used</div>
            <div className="font-semibold">{execution.totalCreditsUsed}</div>
          </div>
        </div>
      </div>

      {/* Node Results */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-4 text-lg font-semibold">Node Execution Log</h2>

        {execution.nodeResults.length === 0 ? (
          <p className="text-muted-foreground">No node results recorded</p>
        ) : (
          <div className="space-y-3">
            {execution.nodeResults.map((result) => (
              <div
                key={result.nodeId}
                className={`overflow-hidden border ${getStatusBorderColor(
                  result.status,
                )}`}
              >
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  onClick={() => toggleNodeExpand(result.nodeId)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span>{getStatusIcon(result.status)}</span>
                    <span className="font-medium">{result.nodeLabel}</span>
                    <span className="text-sm text-muted-foreground">
                      ({result.nodeId})
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {result.creditsUsed} credits
                    </span>
                    {result.retryCount > 0 && (
                      <span className="text-yellow-600">
                        {result.retryCount} retries
                      </span>
                    )}
                    <span>{expandedNodes.has(result.nodeId) ? '▼' : '▶'}</span>
                  </div>
                </Button>

                {expandedNodes.has(result.nodeId) && (
                  <div className="border-t border-white/[0.08] bg-background/50 px-4 py-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Started:</span>{' '}
                        {new Date(result.startedAt).toLocaleString()}
                      </div>
                      {result.completedAt && (
                        <div>
                          <span className="text-muted-foreground">
                            Completed:
                          </span>{' '}
                          {new Date(result.completedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {result.error && (
                      <div className="mt-3 border border-red-200 bg-red-100 p-3 dark:border-red-800 dark:bg-red-900">
                        <div className="mb-1 text-sm font-medium text-red-800 dark:text-red-200">
                          Error
                        </div>
                        <Pre
                          variant="ghost"
                          size="md"
                          className="text-red-700 dark:text-red-300"
                        >
                          {result.error}
                        </Pre>
                      </div>
                    )}
                    {result.output && (
                      <div className="mt-3">
                        <div className="mb-1 text-sm font-medium text-muted-foreground">
                          Output
                        </div>
                        <Pre size="md" className="text-sm">
                          {JSON.stringify(result.output, null, 2)}
                        </Pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Global Error */}
        {execution.error && (
          <div className="mt-6 border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <h3 className="mb-2 font-semibold text-red-800 dark:text-red-200">
              Execution Error
            </h3>
            <Pre
              variant="ghost"
              size="md"
              className="text-red-700 dark:text-red-300"
            >
              {execution.error}
            </Pre>
          </div>
        )}

        {/* Download Logs */}
        <div className="mt-8 flex justify-end">
          <Button variant={ButtonVariant.OUTLINE}>Download Logs (JSON)</Button>
        </div>
      </main>
    </div>
  );
}
