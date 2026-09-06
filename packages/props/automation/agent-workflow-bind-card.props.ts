import type { AgentStrategy } from '@services/automation/agent-strategies.service';

export type WorkflowOption = {
  id: string;
  label: string;
};

export type OverrideRow = {
  id: string;
  key: string;
  value: string;
};

export type Props = {
  agentId: string;
  onBound: () => Promise<void> | void;
  strategy: AgentStrategy;
};
