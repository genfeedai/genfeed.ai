import type { AgentPublishDecision } from '../..';
import type { IBaseEntity, IBrand, IOrganization, IUser } from '../index';

export interface CreateAgentPublishAuditInput {
  workflowExecutionId?: string | null;
  agentStrategyId?: string | null;
  agentThreadId?: string | null;
  autonomyMode: string;
  brandId?: string;
  channel?: string | null;
  decision: AgentPublishDecision;
  policyName: string;
  postGroupId?: string | null;
  reason: string;
}

export interface UpdateAgentPublishAuditInput {
  workflowExecutionId?: string | null;
  agentStrategyId?: string | null;
  agentThreadId?: string | null;
  autonomyMode?: string;
  brandId?: string | null;
  channel?: string | null;
  decision?: AgentPublishDecision;
  policyName?: string;
  postGroupId?: string | null;
  reason?: string;
}

export interface IAgentPublishAudit extends IBaseEntity {
  workflowExecutionId?: string | null;
  agentStrategyId?: string | null;
  agentThreadId?: string | null;
  autonomyMode: string;
  brand?: IBrand | string;
  brandId?: string | null;
  channel?: string | null;
  decision: AgentPublishDecision;
  organization?: IOrganization | string;
  organizationId: string;
  policyName: string;
  postGroupId?: string | null;
  reason: string;
  user?: IUser | string;
  userId: string;
}

export interface IAgentPublishAuditDocument {
  workflowExecutionId: string | null;
  agentStrategyId: string | null;
  agentThreadId: string | null;
  autonomyMode: string;
  brandId: string | null;
  channel: string | null;
  createdAt: Date;
  decision: AgentPublishDecision;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  policyName: string;
  postGroupId: string | null;
  reason: string;
  updatedAt: Date;
  userId: string;
}
