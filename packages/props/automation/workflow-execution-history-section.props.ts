import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

export interface WorkflowExecutionHistorySectionProps {
  executions: IWorkflowExecution[];
  expandedExecutionId: string | null;
  isLoading: boolean;
  onToggleExpand: (executionId: string) => void;
}
