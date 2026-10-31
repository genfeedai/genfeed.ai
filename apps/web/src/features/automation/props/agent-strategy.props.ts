import type { AgentStrategy } from '@genfeedai/services/automation/agent-strategies.service';

export interface AgentDetailPageProps {
  agentId: string;
}

export interface AgentCardProps {
  strategy: AgentStrategy;
  onToggle: (id: string) => Promise<void>;
  onRunNow: (id: string) => Promise<void>;
}
