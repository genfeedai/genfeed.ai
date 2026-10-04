import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type {
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { buildAgentChatCompletionParams } from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { RouterPriority } from '@genfeedai/contracts';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';

export interface SyncChatLoopParams {
  approvedPlan?: Record<string, unknown>;
  context: AgentChatContext;
  threadId: string;
  generationPriority: RouterPriority;
  model: string;
  policy: ResolvedAgentExecutionPolicy;
  request: AgentChatRequest;
  resolvedMemories: AgentMemoryDocument[];
  seedTitle: string;
  systemPromptOverride?: string;
  turnCost: number;
}

export interface SyncLoopState {
  actualModels: Set<string>;
  hasPreviousRoundUsedTools: boolean;
  latestAutoRouting: AgentAutoRoutingResolution | undefined;
  latestProviderUsage: OpenRouterChatCompletionResponse['usage'];
  roundCredits: number;
  terminalContent: string | undefined;
}

export type SyncChatMessages = Parameters<
  typeof buildAgentChatCompletionParams
>[0]['messages'];
export type SyncChatTools = Parameters<
  typeof buildAgentChatCompletionParams
>[0]['tools'];
export type SyncAssistantMessage =
  OpenRouterChatCompletionResponse['choices'][number]['message'];
