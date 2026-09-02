import type { IAgentPublishAuditDocument } from '@genfeedai/contracts/interfaces';

export type AgentPublishAuditDocument = IAgentPublishAuditDocument;

export type AgentPublishAuditScope = {
  brandId?: string;
  organizationId: string;
  userId: string;
};

export type CreateAgentPublishAuditInput = {
  workflowExecutionId?: string | null;
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
