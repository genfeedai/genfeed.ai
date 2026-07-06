import { WorkflowExecutionStatus } from '@genfeedai/enums';

export function mapEngineNodeStatus(status: string): WorkflowExecutionStatus {
  switch (status) {
    case 'pending':
      return WorkflowExecutionStatus.PENDING;
    case 'running':
      return WorkflowExecutionStatus.RUNNING;
    case 'completed':
    case 'skipped':
      return WorkflowExecutionStatus.COMPLETED;
    case 'failed':
      return WorkflowExecutionStatus.FAILED;
    default:
      return WorkflowExecutionStatus.PENDING;
  }
}
