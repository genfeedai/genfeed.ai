import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { ExecutionCreditsSummary } from '@props/automation/run-history-list.props';
import type { WorkflowExecutionTranslate } from '@props/automation/workflow-execution-card.props';

const EXECUTION_STATUS_KEYS: Record<WorkflowExecutionStatus, string> = {
  [WorkflowExecutionStatus.CANCELLED]: 'statusCancelled',
  [WorkflowExecutionStatus.COMPLETED]: 'statusCompleted',
  [WorkflowExecutionStatus.FAILED]: 'statusFailed',
  [WorkflowExecutionStatus.PENDING]: 'statusPending',
  [WorkflowExecutionStatus.RUNNING]: 'statusRunning',
};

/** Plain function (not a hook) so it can be used from `render` callbacks;
 * pass a `common.automation.workflowExecutions`-scoped translate. */
export function getExecutionStatusLabel(
  status: WorkflowExecutionStatus,
  translate: WorkflowExecutionTranslate,
): string {
  return translate(EXECUTION_STATUS_KEYS[status]);
}

export function formatExecutionDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Plain function (not a hook) so it can be used from `render` callbacks;
 * pass a `common.automation.workflowExecutions`-scoped translate. */
export function formatExecutionRelativeTime(
  date: string,
  translate: WorkflowExecutionTranslate,
): string {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return translate('justNow');
  if (minutes < 60) return translate('minutesAgo', { minutes });
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? translate('hoursAgo', { hours })
    : translate('daysAgo', { days: Math.floor(hours / 24) });
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

/**
 * Reconciled credits first, then the pre-run estimate, then the legacy
 * engine counter. Estimates are flagged so the table can mark them.
 */
export function getExecutionCredits(
  execution: IWorkflowExecution,
): ExecutionCreditsSummary {
  const accounting = execution.accounting;
  if (accounting) {
    if (accounting.actualCredits !== null && accounting.actualCredits > 0) {
      return { isEstimate: false, value: accounting.actualCredits };
    }
    if (accounting.knownActualCredits > 0) {
      return { isEstimate: false, value: accounting.knownActualCredits };
    }
    if (
      accounting.estimatedCredits !== null &&
      accounting.estimatedCredits > 0
    ) {
      return { isEstimate: true, value: accounting.estimatedCredits };
    }
  }
  return { isEstimate: false, value: execution.creditsUsed };
}
