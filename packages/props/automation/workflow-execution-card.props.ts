import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface WorkflowExecutionCardProps {
  execution: IWorkflowExecution;
  onCancel?: (id: string) => void;
}
