import { WorkflowExecutionStatus } from '@genfeedai/enums';

/**
 * Maps engine node status strings (often lowercase) onto Prisma-aligned
 * WorkflowExecutionStatus SCREAMING labels.
 */
export function mapEngineNodeStatus(status: string): WorkflowExecutionStatus {
  switch (status.toLowerCase()) {
    case 'pending':
      return WorkflowExecutionStatus.PENDING;
    case 'running':
    case 'processing':
      return WorkflowExecutionStatus.RUNNING;
    case 'completed':
    case 'skipped':
      return WorkflowExecutionStatus.COMPLETED;
    case 'failed':
      return WorkflowExecutionStatus.FAILED;
    case 'cancelled':
    case 'canceled':
      return WorkflowExecutionStatus.CANCELLED;
    default:
      return WorkflowExecutionStatus.PENDING;
  }
}
