import type {
  AgentStrategy,
  AgentStrategyPublishPolicy,
} from '@services/automation/agent-strategies.service';

/** The two earned auto-publish settings a member changes on the agent page. */
export type AgentStrategyPublishPolicyUpdate = Partial<
  Pick<
    AgentStrategyPublishPolicy,
    'autoPublishAfterApprovals' | 'autoPublishEnabled'
  >
>;

export interface AgentStrategyPublishTogglesProps {
  agentId: string;
  onSaved: () => Promise<void>;
  strategy: Pick<AgentStrategy, 'platforms' | 'publishPolicy'>;
}

/** One platform's approval streak toward graduation, for display. */
export interface AgentPlatformApprovalProgress {
  approvalStreak: number;
  isGraduated: boolean;
  label: string;
  platform: string;
}
