import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';

export interface RunStatsStripProps {
  isLoading: boolean;
  /** True when the last statistics request failed or returned garbage;
   * `stats` is then a fallback, not a fresh summary. */
  isStatsDegraded?: boolean;
  stats: WorkflowExecutionStats;
}
