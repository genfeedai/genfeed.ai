'use client';

import {
  ButtonSize,
  ButtonVariant,
  WorkflowExecutionStatus,
} from '@genfeedai/enums';
import type { IWorkflowExecution } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

interface WorkflowExecutionCardProps {
  execution: IWorkflowExecution;
  onCancel?: (id: string) => void;
}

const STATUS_LABELS: Record<WorkflowExecutionStatus, string> = {
  [WorkflowExecutionStatus.CANCELLED]: 'Cancelled',
  [WorkflowExecutionStatus.COMPLETED]: 'Completed',
  [WorkflowExecutionStatus.FAILED]: 'Failed',
  [WorkflowExecutionStatus.PENDING]: 'Pending',
  [WorkflowExecutionStatus.RUNNING]: 'Running',
};

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatRelativeTime(date: string): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function getExecutionLabel(execution: IWorkflowExecution): string {
  const metadataLabel = execution.metadata?.label;
  return (
    execution.workflow?.label ??
    (typeof metadataLabel === 'string' ? metadataLabel : undefined) ??
    execution.workflowId
  );
}

export default function WorkflowExecutionCard({
  execution,
  onCancel,
}: WorkflowExecutionCardProps) {
  const translate = useTranslations('common.automation.workflowExecutions');
  const isActive =
    execution.status === WorkflowExecutionStatus.PENDING ||
    execution.status === WorkflowExecutionStatus.RUNNING;
  const actionIds = Array.from(
    new Set(
      execution.nodeResults
        .map((result) => result.actionId)
        .filter((actionId): actionId is string => Boolean(actionId)),
    ),
  );

  return (
    <div className="gen-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Badge status={execution.status.toLowerCase()}>
            {STATUS_LABELS[execution.status]}
          </Badge>
          <span className="truncate text-sm font-medium">
            {getExecutionLabel(execution)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {execution.creditsUsed > 0 ? (
            <span>
              {execution.creditsUsed} {translate('creditsSuffix')}
            </span>
          ) : null}
          {execution.durationMs ? (
            <span>{formatDuration(execution.durationMs)}</span>
          ) : null}
          <span>
            {formatRelativeTime(
              execution.completedAt ??
                execution.startedAt ??
                execution.createdAt,
            )}
          </span>
          {isActive && onCancel ? (
            <Button
              className="text-destructive hover:text-destructive"
              onClick={() => onCancel(execution.id)}
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {translate('cancel')}
            </Button>
          ) : null}
        </div>
      </div>

      {isActive ? (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div
            className="h-full bg-info transition-[width] duration-500"
            style={{ width: `${execution.progress}%` }}
          />
        </div>
      ) : null}

      {actionIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {actionIds.map((actionId) => (
            <span
              className="bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
              key={actionId}
            >
              {actionId}
            </span>
          ))}
        </div>
      ) : null}

      {execution.error ? (
        <div className="truncate text-xs text-destructive">
          {execution.failedNodeId ? `${execution.failedNodeId}: ` : ''}
          {execution.error}
        </div>
      ) : null}
    </div>
  );
}
