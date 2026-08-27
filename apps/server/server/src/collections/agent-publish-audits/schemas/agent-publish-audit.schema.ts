export type { IAgentPublishAuditDocument as AgentPublishAuditDocument } from '@genfeedai/interfaces';

export type AgentPublishAuditScope = {
  brandId?: string;
  organizationId: string;
  userId: string;
};

export type CreateAgentPublishAuditInput = {
  agentRunId?: string | null;
  agentStrategyId?: string | null;
  agentThreadId?: string | null;
  autonomyMode: string;
  brandId?: string | null;
  channel?: string | null;
  decision: AgentPublishAuditDocument['decision'];
  organizationId: string;
  policyName: string;
  postGroupId?: string | null;
  reason: string;
  userId: string;
};
