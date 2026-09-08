import type {
  AgentWorkObject,
  AgentWorkObjectMaterial,
} from '@genfeedai/contracts/interfaces';

export interface AgentWorkObjectState extends AgentWorkObjectMaterial {
  threadId: string;
  viewedSessionId?: string;
  viewedRevision?: number;
  reviewStatus: AgentWorkObject['reviewStatus'];
  reviewError?: string;
  reviewToken?: string;
  reviewExecutionId?: string;
}

export interface AgentWorkObjectScope {
  threadId: string;
  organizationId: string;
  userId: string;
  brandId?: string;
}
