import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface WorkflowExecutionRowProps {
  execution: IWorkflowExecution;
  isExpanded: boolean;
  onToggle: (executionId: string) => void;
}
