'use client';
import { ButtonVariant, WorkflowExecutionStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { getWorkflowExecutionLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import { Pre } from '@genfeedai/ui';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getJsonApiErrorMember,
  getJsonApiErrorMessage,
} from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
  status: WorkflowExecutionStatus;
  error?: string;
  output?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  retryCount: number;
  creditsUsed: number;
}

interface ExecutionDetail {
  accounting?: ExecutionResult['accounting'];
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

const NODE_ROW_SKELETON_KEYS = [
  'node-row-skeleton-1',
  'node-row-skeleton-2',
  'node-row-skeleton-3',
];

/**
 * Execution Detail Page - Shows detailed logs for a specific run
 */
function mapNodeResult(node: ExecutionNodeResult): NodeResult {
  return {
    completedAt: node.completedAt,
    creditsUsed: node.creditsUsed ?? 0,
    error: node.error,
    nodeId: node.nodeId,
    nodeLabel: node.nodeType,
    output: node.output,
    retryCount: node.retryCount ?? 0,
    startedAt: node.startedAt || new Date().toISOString(),
    status: node.status || WorkflowExecutionStatus.PENDING,
  };
}

function mapExecution(result: ExecutionResult): ExecutionDetail {
  const workflowLabel = getWorkflowExecutionLabel(result);

  return {
    accounting: result.accounting,
    completedAt: result.completedAt,
    durationMs: result.durationMs,
    error: result.error,
    metadata: result.metadata,
    nodeResults: (result.nodeResults || []).map(mapNodeResult),
    runId: result.id,
    startedAt: result.startedAt || result.createdAt,
    status: result.status || WorkflowExecutionStatus.PENDING,
    totalCreditsUsed: result.creditsUsed ?? 0,
    workflowId: result.workflowId,
    workflowLabel,
  };
}

export default function ExecutionDetailPage({
  executionId: runId,
}: ExecutionLogsProps) {
  const translate = useTranslations('common.automation.workflows.executions');
  const { href } = useOrgUrl();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Cached per run: coming back to a run paints its log at once while it
  // refreshes. A 404 resolves to null (the not-found state), not an error.
  const executionQuery = useAuthedQuery({
    enabled: Boolean(runId),
    queryFn: async (service) => {
      try {
        return mapExecution(await service.getExecution(runId));
      } catch (err) {
        if (getJsonApiErrorMember(err)?.status === 404) {
          return null;
        }
        logger.error('Failed to load execution details', { err, runId });
        throw err;
      }
    },
    queryKey: ['workflow-execution', runId],
    service: createWorkflowApiService,
  });
  const execution = executionQuery.data ?? null;
  const isLoading = Boolean(runId) && executionQuery.isPending;
  const error = executionQuery.isError
    ? getJsonApiErrorMessage(
        executionQuery.error,
        'Failed to load execution details',
      )
    : null;

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
      <div className="min-h-screen bg-background">
        <div className="flex items-center justify-end gap-4 px-6 pt-4">
          <Link
            href={href(APP_ROUTES.AUTOMATION.RUNS)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {translate('allExecutions')}
          </Link>
        </div>
        <div className="mx-auto grid max-w-5xl gap-3 px-6 py-8">
          <SkeletonCard
            label="Loading execution logs"
            showDescription={false}
            showImage={false}
          />
          {NODE_ROW_SKELETON_KEYS.map((key) => (
            <SkeletonCard
              key={key}
              label="Loading node result"
              showActions={false}
              showDescription={false}
              showImage={false}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !execution) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h2 className="mb-4 text-2xl font-semibold">
          Execution Failed To Load
        </h2>
        <p className="mb-6 text-muted-foreground">{error}</p>
        <Link
          href={href(APP_ROUTES.AUTOMATION.RUNS)}
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
        <h2 className="mb-4 text-2xl font-semibold">Execution Not Found</h2>
        <p className="mb-6 text-muted-foreground">
          The execution run you're looking for doesn't exist.
        </p>
        <Link
          href={href(APP_ROUTES.AUTOMATION.RUNS)}
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
        executionsHref={href(APP_ROUTES.AUTOMATION.RUNS)}
        workflowHref={
          execution.metadata?.isSystemAction === true
            ? null
            : href(
                `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${execution.workflowId}?execution=${execution.runId}`,
              )
        }
      />

      <ExecutionSummaryBar
        accounting={execution.accounting}
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
          <EmptyState title="No node results recorded" />
        ) : (
          <div className="space-y-3">
            {execution.nodeResults.map((result) => (
              <ExecutionNodeResultItem
                key={result.nodeId}
                result={result}
                accounting={execution.accounting?.nodes.find(
                  (node) => node.nodeId === result.nodeId,
                )}
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
          <Button variant={ButtonVariant.SECONDARY}>
            Download Logs (JSON)
          </Button>
        </div>
      </main>
    </div>
  );
}
