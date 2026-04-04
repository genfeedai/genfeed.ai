import type { IAgentRun } from '@cloud/interfaces';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';

export interface AgentDetailPageProps {
  agentId: string;
}

export interface AgentCardProps {
  strategy: AgentStrategy;
  onToggle: (id: string) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
}

export interface AgentRunContentGridProps {
  runId: string;
}

export interface AgentRunRowProps {
  run: IAgentRun;
  isExpanded: boolean;
  onToggle: (runId: string) => void;
}
