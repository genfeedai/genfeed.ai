import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { TableSortDirection } from '@genfeedai/props/ui/display/table.props';

export interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
  /** Render URL-driven server pagination under the table. */
  isPaginated?: boolean;
  onClearFilter?: () => void;
  /** Server-side sort (paginated lists): only status, duration and started sort. */
  onSortChange?: (key: string, direction: TableSortDirection) => void;
  sortDirection?: TableSortDirection;
  sortKey?: string;
}

export interface ExecutionCreditsSummary {
  value: number;
  isEstimate: boolean;
}
