import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentPlanReviewMetadata } from '@api/services/agent-orchestrator/interfaces/agent-plan-review-metadata.interface';
import type { AgentInputRequestOption } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';

/** The one question the planner asks instead of drafting a plan. */
export interface PlanModeQuestion {
  allowFreeText: boolean;
  options: AgentInputRequestOption[];
  prompt: string;
  recommendedOptionId?: string;
  title: string;
}

export interface PlanModeResponseParams {
  context: AgentChatContext;
  model: string;
  reviewMetadata?: AgentPlanReviewMetadata;
  request: AgentChatRequest;
  resolvedMemories: AgentMemoryDocument[];
  seedTitle: string;
  systemPromptOverride?: string;
  threadId: string;
  turnCost: number;
}
