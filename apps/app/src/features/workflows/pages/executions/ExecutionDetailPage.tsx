'use client';

import { APP_ROUTES } from '@genfeedai/constants';
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
import ExecutionDetailHeader from './ExecutionDetailHeader';
import ExecutionNodeResultItem from './ExecutionNodeResultItem';
import ExecutionSummaryBar from './ExecutionSummaryBar';

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
        if (controller.signal.aborted) {
          return;
        }
        const service = await getService();
        const result = await service.getExecution(runId);
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
        <div className="animate-pulse">Loading execution logs…</div>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="mb-4 text-2xl font-semibold">
          Execution Failed To Load
        </h1>
        <p className="mb-6 text-muted-foreground">{error}</p>
        <Link
          href={href(APP_ROUTES.WORKFLOWS.EXECUTIONS)}
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
        <h1 className="mb-4 text-2xl font-semibold">Execution Not Found</h1>
        <p className="mb-6 text-muted-foreground">
          The execution run you're looking for doesn't exist.
        </p>
        <Link
          href={href(APP_ROUTES.WORKFLOWS.EXECUTIONS)}
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
      <ExecutionDetailHeader
        runId={execution.runId}
        workflowLabel={execution.workflowLabel}
        status={execution.status}
        executionsHref={href(APP_ROUTES.WORKFLOWS.EXECUTIONS)}
        workflowHref={href(
          `/workflows/${execution.workflowId}?execution=${execution.runId}`,
        )}
      />

      <ExecutionSummaryBar
        status={execution.status}
        startedAt={startedAt}
        duration={duration}
        totalCreditsUsed={execution.totalCreditsUsed}
        etaDisplay={etaDisplay}
      />

      {/* Node Results */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-4 text-lg font-semibold">Node Execution Log</h2>

        {execution.nodeResults.length === 0 ? (
          <p className="text-muted-foreground">No node results recorded</p>
        ) : (
          <div className="space-y-3">
            {execution.nodeResults.map((result) => (
              <ExecutionNodeResultItem
                key={result.nodeId}
                result={result}
                isExpanded={expandedNodes.has(result.nodeId)}
                onToggle={toggleNodeExpand}
              />
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
