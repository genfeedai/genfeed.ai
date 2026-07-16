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

export interface PublishConfirmedContentInput {
  caption?: string;
  contentId: string;
  credentials: AgentPublishCredential[];
  ctx: AgentPublishContext;
  ingredient: Record<string, unknown>;
  platforms: string[];
  scheduledAt?: string;
  sourceActionId: string;
}

export interface AgentPublishIdempotencyInput {
  baseContent: string;
  contentId: string;
  organizationId: string;
  platforms: string[];
  scheduledAt?: string;
  sourceActionId: string;
  threadId?: string;
  userId: string;
}
