import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export const EXECUTION_STATUS_LABELS: Record<WorkflowExecutionStatus, string> =
  {
    [WorkflowExecutionStatus.CANCELLED]: 'Cancelled',
    [WorkflowExecutionStatus.COMPLETED]: 'Completed',
    [WorkflowExecutionStatus.FAILED]: 'Failed',
    [WorkflowExecutionStatus.PENDING]: 'Pending',
    [WorkflowExecutionStatus.RUNNING]: 'Running',
  };

export function formatExecutionDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatExecutionRelativeTime(date: string): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function getExecutionLabel(
  execution: IWorkflowExecution,
  fallback: string,
): string {
  const metadataLabel = execution.metadata?.label;
  return (
    execution.workflow?.label ??
    (typeof metadataLabel === 'string' ? metadataLabel : undefined) ??
    fallback
  );
}
