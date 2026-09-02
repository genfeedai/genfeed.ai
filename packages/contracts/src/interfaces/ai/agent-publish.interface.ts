import type { PostVisibility } from '../..';
import type { ValidatedAgentScope } from './agent-scope-context.interface';

export interface AgentPublishCredential {
  id?: unknown;
  platform?: unknown;
}

export interface AgentPublishContext {
  autonomyMode?: string;
  confirmationOrigin?: 'thread-ui-action';
  organizationId: string;
  runId?: string;
  strategyId?: string;
  threadId?: string;
  userId: string;
  validatedScope?: ValidatedAgentScope;
}

export interface AgentPublishTargetAttachment {
  body: string;
  kind: string;
  order?: number;
  platform?: string;
}

export interface AgentPublishTargetPayload {
  attachments?: AgentPublishTargetAttachment[];
  caption?: string;
  credentialId: string;
  platform: string;
  scheduledAt?: string;
  settings?: Record<string, unknown>;
  signatureIds?: string[];
  timezone?: string;
  visibility?: PostVisibility;
}

export interface PublishConfirmedContentInput {
  caption?: string;
  contentId: string;
  credentials: AgentPublishCredential[];
  ctx: AgentPublishContext;
  ingredient: Record<string, unknown>;
  platforms: string[];
  postingSetId?: string;
  scheduledAt?: string;
  sourceActionId: string;
  targets?: AgentPublishTargetPayload[];
  timezone?: string;
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
