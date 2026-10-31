import { WorkflowExecutionStatus } from '@genfeedai/contracts';

/** Workflow batches use the canonical WorkflowExecution lifecycle. */
const TERMINAL_BATCH_STATUSES: ReadonlySet<WorkflowExecutionStatus> = new Set([
  WorkflowExecutionStatus.COMPLETED,
  WorkflowExecutionStatus.FAILED,
  WorkflowExecutionStatus.CANCELLED,
]);

/** A parent execution in a terminal status will not change again. */
export function isTerminalBatchStatus(
  status: WorkflowExecutionStatus,
): boolean {
  return TERMINAL_BATCH_STATUSES.has(status);
}
