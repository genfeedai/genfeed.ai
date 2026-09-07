import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface ActiveRunsPanelProps {
  executions: IWorkflowExecution[];
  onCancel?: (id: string) => void;
}
