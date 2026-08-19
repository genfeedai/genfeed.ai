import type { PostVisibility } from '@genfeedai/enums';
import type { ValidatedAgentScope } from './agent-scope-context.interface';

export interface AgentPublishCredential {
  id?: unknown;
  platform?: unknown;
}

export interface AgentPublishContext {
  organizationId: string;
  runId?: string;
  strategyId?: string;
  threadId?: string;
  userId: string;
  validatedScope?: ValidatedAgentScope;
}

export interface AgentPublishTargetPayload {
  caption?: string;
  credentialId: string;
  platform: string;
  settings?: Record<string, unknown>;
  visibility?: PostVisibility;
}

export interface PublishConfirmedContentInput {
  caption?: string;
  contentId: string;
  credentials: AgentPublishCredential[];
  ctx: AgentPublishContext;
  ingredient: Record<string, unknown>;
  platforms: string[];
  scheduledAt?: string;
  sourceActionId: string;
  targets?: AgentPublishTargetPayload[];
  visibility: PostVisibility;
}

export interface ScheduleCanonicalPostInput {
  ctx: AgentPublishContext;
  groupId: string;
  postId: string;
  scheduledAt: string;
}

export interface AgentPublishIdempotencyInput {
  baseContent: string;
  contentId: string;
  organizationId: string;
  platforms: string[];
  scheduledAt?: string;
  sourceActionId: string;
  targets?: AgentPublishTargetPayload[];
  threadId?: string;
  userId: string;
  visibility: PostVisibility;
}
