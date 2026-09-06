import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
  onClearFilter?: () => void;
}
