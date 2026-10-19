import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
  /** Render URL-driven server pagination under the table. */
  isPaginated?: boolean;
  onClearFilter?: () => void;
}

export interface ExecutionCreditsSummary {
  value: number;
  isEstimate: boolean;
}
