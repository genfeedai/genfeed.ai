'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
} from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import { Progress } from '@ui/primitives/progress';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineCheck,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineClock,
  HiOutlinePlay,
  HiOutlineXMark,
} from 'react-icons/hi2';

interface ExecutionNodeResult {
  nodeId: string;
  nodeType: string;
  status: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

interface WorkflowExecution {
  id: string;
  status: string;
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

const STATUS_ICONS: Record<string, React.ReactNode> = {
  cancelled: <HiOutlineXMark className="h-4 w-4 text-muted-foreground" />,
  completed: <HiOutlineCheck className="h-4 w-4 text-green-500" />,
  failed: <HiOutlineXMark className="h-4 w-4 text-red-500" />,
  pending: <HiOutlineClock className="h-4 w-4 text-muted-foreground" />,
  running: (
    <HiOutlineArrowPath className="h-4 w-4 text-blue-500 animate-spin" />
  ),
};

const STATUS_VARIANTS: Record<string, 'ghost' | 'success' | 'error' | 'info'> =
  {
    cancelled: 'ghost',
    completed: 'success',
    failed: 'error',
    pending: 'ghost',
    running: 'info',
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
      <div
        className="flex cursor-pointer items-center gap-3 p-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {STATUS_ICONS[execution.status]}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge
              variant={STATUS_VARIANTS[execution.status] || 'ghost'}
              size={ComponentSize.SM}
            >
              {execution.status}
            </Badge>
            <span className="text-xs opacity-60">
              {formatDistanceToNow(new Date(execution.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          {execution.durationMs && (
            <span className="text-xs opacity-60">
              Duration: {formatDuration(execution.durationMs)}
            </span>
          )}
        </div>
        {execution.status === 'running' && (
          <Button
            type="button"
            variant={ButtonVariant.GHOST}
            size={ButtonSize.XS}
            className="text-error"
            onClick={(e) => {
              e.stopPropagation();
              onCancel(execution.id);
            }}
            label="Cancel"
          />
        )}
        {isExpanded ? (
          <HiOutlineChevronUp className="h-4 w-4" />
        ) : (
          <HiOutlineChevronDown className="h-4 w-4" />
        )}
      </div>

      {isExpanded && (
        <div className="border-t border-white/[0.08] p-3">
          {/* Progress */}
          {execution.status === 'running' && (
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
    // Poll for updates every 10 seconds when panel is open
    const interval = setInterval(fetchExecutions, 10000);
    return () => clearInterval(interval);
  }, [fetchExecutions]);

  const handleCancel = useCallback(
    async (executionId: string) => {
      try {
        await fetch(`/api/workflow-executions/${executionId}/cancel`, {
          method: 'POST',
        });
        fetchExecutions();
      } catch (_err) {
        // Ignore
      }
    },
    [fetchExecutions],
  );

  return (
    <div className="border-b border-white/[0.08]">
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <HiOutlinePlay className="h-4 w-4" />
          <span className="font-semibold text-sm">Execution History</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="ghost" size={ComponentSize.SM}>
            {executions.length}
          </Badge>
          {isCollapsed ? (
            <HiOutlineChevronDown className="h-4 w-4" />
          ) : (
            <HiOutlineChevronUp className="h-4 w-4" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="max-h-80 overflow-y-auto p-4 pt-0 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
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
