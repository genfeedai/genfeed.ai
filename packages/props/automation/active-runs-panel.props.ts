import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface ActiveRunsPanelProps {
  executions: IWorkflowExecution[];
  isHeadingVisible?: boolean;
  onCancel?: (id: string) => void;
}
