import type { AgentStrategy } from '@genfeedai/services/automation/agent-strategies.service';

/**
 * The one visible action an agent row or card carries. `runNow` everywhere,
 * except a paused agent in Needs you, whose resolving action is `activate`.
 */
export type AgentHubPrimaryAction = 'runNow' | 'activate';

/** Which intent section renders the row; it decides the row's secondary line. */
export type AgentHubRowSection = 'needsYou' | 'yours' | 'all';

export interface AgentHubActionHandlers {
  onRunNow: (id: string) => Promise<void>;
  onRunWorkflow: (strategy: AgentStrategy) => void;
  onToggle: (id: string, isActive: boolean) => Promise<void>;
}

export interface AgentHubActionsProps extends AgentHubActionHandlers {
  primaryAction: AgentHubPrimaryAction;
  strategy: AgentStrategy;
}

export interface AgentHubRowProps extends AgentHubActionHandlers {
  section: AgentHubRowSection;
  strategy: AgentStrategy;
}

export interface AgentHubCardProps extends AgentHubActionHandlers {
  strategy: AgentStrategy;
}

export interface AgentHubStatusBadgeProps {
  strategy: AgentStrategy;
}

export interface AgentHubFactsProps {
  section: AgentHubRowSection;
  strategy: AgentStrategy;
}
