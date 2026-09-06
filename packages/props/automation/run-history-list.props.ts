import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
  onClearFilter?: () => void;
  currentPage: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
}

export interface ExecutionCreditsSummary {
  value: number;
  isEstimate: boolean;
}
