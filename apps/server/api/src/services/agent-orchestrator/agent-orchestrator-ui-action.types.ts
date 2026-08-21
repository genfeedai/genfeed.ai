import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type {
  AgentChatContext,
  AgentChatRequest,
  AgentChatResult,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { RouterPriority } from '@genfeedai/enums';
import type {
  AgentDashboardOperation,
  AgentUiAction,
} from '@genfeedai/interfaces';

export type AgentOrchestratorUiActionHost = {
  executeSynchronousChatLoop: (params: {
    context: AgentChatContext;
    generationPriority: RouterPriority;
    model: string;
    policy: ResolvedAgentExecutionPolicy;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  generatePlanModeResponse: (params: {
    context: AgentChatContext;
    model: string;
    request: AgentChatRequest;
    resolvedMemories: AgentMemoryDocument[];
    reviewMetadata?: {
      lastReviewAction?: 'approve' | 'request_changes';
      revisionNote?: string;
    };
    seedTitle: string;
    systemPromptOverride?: string;
    threadId: string;
    turnCost: number;
  }) => Promise<AgentChatResult>;
  runInThreadLane: <T>(threadId: string, run: () => Promise<T>) => Promise<T>;
};

export type ThreadUiActionExecutionParams = {
  context: AgentChatContext;
  model: string;
  payload?: Record<string, unknown>;
  threadId: string;
};

export type FinalizeStructuredAssistantTurnParams = {
  content: string;
  context: AgentChatContext;
  eventIdempotencyKey?: string;
  metadata?: Record<string, unknown>;
  model: string;
  result: {
    creditsUsed?: number;
    data?: Record<string, unknown>;
    nextActions?: AgentUiAction[];
    requiresConfirmation?: boolean;
    riskLevel?: 'low' | 'medium' | 'high';
  };
  threadId: string;
  toolCalls: ToolCallSummary[];
};

export type LatestUiBlocks = {
  operation: AgentDashboardOperation;
  blocks?: unknown[];
  blockIds?: string[];
};
