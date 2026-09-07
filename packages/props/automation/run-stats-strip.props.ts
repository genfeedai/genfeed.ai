import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';

export interface RunStatsStripProps {
  isLoading: boolean;
  stats: WorkflowExecutionStats;
}
