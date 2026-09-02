'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  formatEnumLabel,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { useVisiblePolling } from '@genfeedai/hooks/ui/use-visible-polling/use-visible-polling';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Progress } from '@ui/primitives/progress';
import { formatDistanceToNow } from 'date-fns';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Play,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ExecutionNodeResult {
  nodeId: string;
  nodeType: string;
  /**
   * Node statuses are normalised to the Prisma enum before they reach the wire
   * (`mapEngineNodeStatus`), so they are SCREAMING_SNAKE — never the engine's
   * internal lowercase spelling.
   *
   * @see .agents/memory/rules/enum_source_of_truth.md
   */
  status: WorkflowExecutionStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowExecution {
  id: string;
  status: WorkflowExecutionStatus;
  trigger: string;
  progress: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  nodeResults: ExecutionNodeResult[];
  createdAt: string;
}

interface ExecutionHistoryPanelProps {
  workflowId: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const STATUS_ICONS: Record<WorkflowExecutionStatus, React.ReactNode> = {
  [WorkflowExecutionStatus.CANCELLED]: (
    <X className="size-4 text-muted-foreground" />
  ),
  [WorkflowExecutionStatus.COMPLETED]: (
    <Check className="size-4 text-success" />
  ),
  [WorkflowExecutionStatus.FAILED]: <X className="size-4 text-destructive" />,
  [WorkflowExecutionStatus.PENDING]: (
    <Clock className="size-4 text-muted-foreground" />
  ),
  [WorkflowExecutionStatus.RUNNING]: (
    <RefreshCw className="size-4 text-info animate-spin" />
  ),
};

const STATUS_VARIANTS: Record<
  WorkflowExecutionStatus,
  'ghost' | 'success' | 'error' | 'info'
> = {
  [WorkflowExecutionStatus.CANCELLED]: 'ghost',
  [WorkflowExecutionStatus.COMPLETED]: 'success',
  [WorkflowExecutionStatus.FAILED]: 'error',
  [WorkflowExecutionStatus.PENDING]: 'ghost',
  [WorkflowExecutionStatus.RUNNING]: 'info',
};

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${(ms / 60000).toFixed(1)}m`;
}

function ExecutionItem({
  execution,
  onCancel,
}: {
  execution: WorkflowExecution;
  onCancel: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className=" border border-white/[0.08] bg-card">
      <div className="flex items-center gap-3 p-3">
        <Button
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {STATUS_ICONS[execution.status]}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant={STATUS_VARIANTS[execution.status] || 'ghost'}
                size={ComponentSize.SM}
              >
                {formatEnumLabel(execution.status)}
              </Badge>
              <span className="text-xs opacity-60">
                <ClientDateTime
                  value={execution.createdAt}
                  format={(date) =>
                    formatDistanceToNow(date, {
                      addSuffix: true,
                    })
                  }
                />
              </span>
            </div>
            {execution.durationMs && (
              <span className="text-xs opacity-60">
                Duration: {formatDuration(execution.durationMs)}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
        {execution.status === WorkflowExecutionStatus.RUNNING && (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className="text-error"
            onClick={() => onCancel(execution.id)}
            label="Cancel"
          />
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.08] p-3">
          {/* Progress */}
          {execution.status === WorkflowExecutionStatus.RUNNING && (
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span>Progress</span>
                <span>{execution.progress}%</span>
              </div>
              <Progress className="h-2" value={execution.progress} />
            </div>
          )}

          {/* Error message */}
          {execution.error && (
            <Alert type={AlertCategory.ERROR} className="mb-3 text-sm">
              {execution.error}
            </Alert>
          )}

          {/* Node results */}
          {execution.nodeResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium">Node Results</h4>
              {execution.nodeResults.map((result) => (
                <div
                  key={result.nodeId}
                  className="flex items-center gap-2 text-xs"
                >
                  {STATUS_ICONS[result.status]}
                  <span className="flex-1 truncate">{result.nodeType}</span>
                  {result.error && (
                    <span
                      className="text-error truncate max-w-32"
                      title={result.error}
                    >
                      {result.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Trigger info */}
          <div className="mt-3 text-xs opacity-60">
            Triggered: {execution.trigger}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cadence for re-reading run progress while the panel is open and in front. */
const EXECUTION_POLL_INTERVAL_MS = 10_000;

export default function ExecutionHistoryPanel({
  workflowId,
  isCollapsed = false,
  onToggleCollapse,
}: ExecutionHistoryPanelProps) {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/workflow-executions/workflow/${workflowId}?limit=10`,
      );
      if (!response.ok) {
        throw new Error('Failed to fetch executions');
      }
      const data = await response.json();
      setExecutions(data.data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  useVisiblePolling(fetchExecutions, {
    intervalMs: EXECUTION_POLL_INTERVAL_MS,
  });

  const handleCancel = useCallback(
    async (executionId: string) => {
      try {
        // The dedicated `/cancel` RPC route was collapsed into the generic
        // execution PATCH by the REST audit (#1354).
        const response = await fetch(
          `/v1/core/workflow-executions/${executionId}`,
          {
            body: JSON.stringify({
              status: WorkflowExecutionStatus.CANCELLED,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH',
          },
        );
        if (!response.ok) {
          throw new Error('Failed to cancel execution');
        }
        fetchExecutions();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to cancel execution',
        );
      }
    },
    [fetchExecutions],
  );

  return (
    <div className="border-b border-white/[0.08]">
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <Play className="size-4" />
          <span className="font-semibold text-sm">Execution History</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="ghost" size={ComponentSize.SM}>
            {executions.length}
          </Badge>
          {isCollapsed ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronUp className="size-4" />
          )}
        </div>
      </Button>

      {!isCollapsed && (
        <div className="max-h-80 overflow-y-auto p-4 pt-0 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <span className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-error text-center py-4">{error}</div>
          ) : executions.length === 0 ? (
            <p className="text-sm opacity-60 text-center py-4">
              No executions yet. Run your workflow to see history.
            </p>
          ) : (
            executions.map((execution) => (
              <ExecutionItem
                key={execution.id}
                execution={execution}
                onCancel={handleCancel}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
