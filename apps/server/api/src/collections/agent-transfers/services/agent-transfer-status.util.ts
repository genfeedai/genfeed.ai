import {
  AgentTransferStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';

export function projectAgentTransferStatus(
  status: string,
): AgentTransferStatus {
  switch (status) {
    case WorkflowExecutionStatus.RUNNING:
      return AgentTransferStatus.RUNNING;
    case WorkflowExecutionStatus.COMPLETED:
      return AgentTransferStatus.COMPLETED;
    case WorkflowExecutionStatus.CANCELLED:
      return AgentTransferStatus.CANCELLED;
    default:
      return AgentTransferStatus.FAILED;
  }
}
