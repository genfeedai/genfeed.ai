import type { AgentExecutionTrigger } from '@genfeedai/enums';

/**
 * Minimal AgentRuntime turn input — campaign (and future non-chat) callers
 * create a run through the runtime instead of writing AgentRun + queueing
 * directly. See apps/docs/content/core-loop/agent-orchestration.mdx.
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
  trigger: AgentExecutionTrigger;
  userId: string;
}

export interface IAgentRuntimeTurnHandle {
  runId: string;
  threadId: string;
}
