import type { AgentRuntimeState } from '../../enums/agent-runtime-state.enum';

/**
 * Minimal AgentRuntime turn input — campaign (and future non-chat) callers
 * enqueue the hidden agent-turn system workflow.
 */
export interface IAgentRuntimeStartTurnInput {
  agentType?: string;
  autonomyMode?: string;
  brandId?: string | null;
  campaignId?: string;
  creditBudget?: number;
  label: string;
  metadata?: Record<string, unknown>;
  model?: string;
  objective: string;
  organizationId: string;
  strategyId: string;
  threadId?: string;
  threadTitle?: string;
  trigger?: string;
  userId: string;
}

export interface IAgentRuntimeTurnHandle {
  executionId: string;
  threadId: string;
}

/**
 * Latest-run projection for the cross-thread runs surface (#4062).
 * Not a Prisma row. `id` is the durable run id (`WorkflowExecution.id`
 * when present, otherwise the snapshot `activeRun.runId`).
 */
export interface IAgentRunProjection {
  brandId?: string | null;
  brandLabel?: string | null;
  decisionHref?: string | null;
  id: string;
  inputRequestId?: string | null;
  isProjectionStale: boolean;
  projectedAt: string;
  runtimeState: AgentRuntimeState;
  startedAt?: string | null;
  threadId: string;
  threadTitle?: string | null;
}
