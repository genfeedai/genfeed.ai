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
