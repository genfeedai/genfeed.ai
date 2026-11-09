import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type { AgentOrchestratorContextService } from '@api/services/agent-orchestrator/agent-orchestrator-context.service';
import type {
  AgentChatAttachment,
  AgentChatContext,
  AgentChatRequest,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { AgentToolRoundState } from '@api/services/agent-orchestrator/interfaces/agent-turn-round-runner.interface';
import type { buildAgentChatCompletionParams } from '@api/services/agent-orchestrator/utils/agent-tool-definitions.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { CuratedActionName } from '@genfeedai/actions';
import type { AgentType, RouterPriority } from '@genfeedai/contracts';
import type { AgentAutoRoutingResolution } from '@genfeedai/contracts/interfaces';

/** One streamed chat turn: everything `runStreamLoop` receives. */
export interface StreamLoopParams {
  agentType?: AgentType;
  attachments?: AgentChatAttachment[];
  context: AgentChatContext;
  generationPriority: RouterPriority;
  memoryEntries: AgentMemoryDocument[];
  model: string;
  resolvedPolicy: ResolvedAgentExecutionPolicy;
  runStartedAt?: string;
  seedTitle?: string;
  source?: AgentChatRequest['source'];
  systemPromptOverride?: string;
  threadId: string;
  turnCost: number;
}

export type StreamChatMessages = Parameters<
  typeof buildAgentChatCompletionParams
>[0]['messages'];
export type StreamChatTools = Parameters<
  typeof buildAgentChatCompletionParams
>[0]['tools'];
export type StreamAssistantMessage =
  OpenRouterChatCompletionResponse['choices'][number]['message'];

/** Inputs resolved once per turn, before the first inference round. */
export interface StreamTurnInputs {
  allowedToolNames: Set<CuratedActionName>;
  canStreamLiveTokens: boolean;
  latestUserMessage: string;
  memoryEntriesForResponse: ReturnType<
    AgentOrchestratorContextService['buildMemoryEntriesForResponse']
  >;
  memoryInfluence: ReturnType<
    AgentOrchestratorContextService['buildMemoryInfluenceMetadata']
  >;
  messages: StreamChatMessages;
  tools: StreamChatTools;
}

/** Mutable bookkeeping that carries across the rounds of one streamed turn. */
export interface StreamLoopState {
  actualModels: Set<string>;
  hasPreviousRoundUsedTools: boolean;
  hasRequestedUnproducedDrafts: boolean;
  latestAutoRouting: AgentAutoRoutingResolution | undefined;
  latestProviderUsage: OpenRouterChatCompletionResponse['usage'];
  roundCredits: number;
  terminalContent: string | undefined;
  toolRoundState: AgentToolRoundState;
}

/** What one inference round produced, handed to the response/tool branches. */
export interface StreamInferenceRound {
  defaultModelKey: string;
  response: OpenRouterChatCompletionResponse;
  streamedTokenCount: number;
}

/** `continue` runs another round; `finished` ends the turn. */
export type StreamRoundOutcome = 'continue' | 'finished';
