import type {
  AgentStrategyPerformanceSnapshot,
  AgentStrategyReport,
} from '@services/automation/agent-strategies.service';

export interface UseAgentPerformanceResult {
  snapshot: AgentStrategyPerformanceSnapshot | undefined;
  isSnapshotLoading: boolean;
  isSnapshotError: boolean;
  reports: AgentStrategyReport[];
  isReportsLoading: boolean;
  isReportsError: boolean;
}
