import type {
  IAgentStrategyRunHistoryItem,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';

export interface AgentActivitySectionProps {
  agentId: string;
  runHistory: IAgentStrategyRunHistoryItem[];
  executions: IWorkflowExecution[];
  isExecutionsLoading: boolean;
  isExecutionsError: boolean;
}
