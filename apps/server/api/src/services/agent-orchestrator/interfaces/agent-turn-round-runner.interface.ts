import type {
  AgentChatContext,
  AgentChatRequest,
  ToolCallSummary,
} from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { AgentArtifactCompletionMetadata } from '@api/services/agent-orchestrator/utils/agent-artifact-reference-metadata.util';
import type { TurnKnowledgePassages } from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import type {
  OpenRouterMessage,
  OpenRouterToolCallResponse,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { CuratedActionName } from '@genfeedai/actions';
import type { RouterPriority } from '@genfeedai/contracts';
import type {
  AgentDashboardOperation,
  AgentToolResult,
  AgentUIBlock,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';

export type AgentToolRoundRiskLevel = 'low' | 'medium' | 'high';

type AgentToolRoundUiBlocks = {
  blockIds?: string[];
  blocks?: unknown[];
  operation: AgentDashboardOperation;
} | null;

/**
 * Mutable accumulators shared across tool rounds within a single chat turn.
 * The runner mutates these in place so sync/stream loops keep identical merge
 * semantics without re-implementing accumulation.
 */
export type AgentToolRoundState = {
  artifactMetadata: AgentArtifactCompletionMetadata[];
  highestRiskLevel: AgentToolRoundRiskLevel;
  /** Passages `search_knowledge` showed the model this turn; the only citable ones. */
  knowledgePassages?: TurnKnowledgePassages;
  latestUiBlocks: AgentToolRoundUiBlocks;
  reviewRequired: boolean;
  toolCalls: ToolCallSummary[];
  totalCreditsUsed: number;
  uiActions: AgentUiAction[];
};

type AgentToolRoundCancelAction = 'cancel' | 'continue';

type AgentToolRoundStartedEvent = {
  parameters: Record<string, unknown>;
  startTime: number;
  toolCallId: string;
  toolName: CuratedActionName;
};

type AgentToolRoundCompletedEvent = {
  durationMs: number;
  kind: 'executed' | 'insufficient_credits' | 'unknown';
  parameters: Record<string, unknown>;
  requestedToolName: CuratedActionName;
  result?: AgentToolResult;
  summary: ToolCallSummary;
  toolCallId: string;
  toolName: string;
};

type AgentToolRoundUiBlocksEvent = {
  blockIds?: string[];
  blocks: AgentUIBlock[];
  deferPublish?: boolean;
  operation: AgentDashboardOperation;
  resultData: Record<string, unknown>;
};

export type AgentToolRoundStrategy = {
  /**
   * Stream: check cancellation before each tool call. Return `'cancel'` to
   * stop the round (caller handles cancelled-stream lifecycle).
   */
  onBeforeTool?: () => Promise<AgentToolRoundCancelAction>;
  /**
   * Stream: check cancellation after tool execution completes.
   */
  onAfterTool?: () => Promise<AgentToolRoundCancelAction>;
  /**
   * Mode-specific "tool started" emission.
   * Sync → thread event recorder; stream → SSE/work events.
   */
  onToolStarted?: (event: AgentToolRoundStartedEvent) => Promise<void>;
  /**
   * Mode-specific "tool completed" emission (success and failure paths).
   */
  onToolCompleted?: (event: AgentToolRoundCompletedEvent) => Promise<void>;
  /**
   * Mode-specific UI-blocks emission for `render_dashboard`.
   * Sync always records; stream may skip publish when `deferPublish` is set.
   */
  onUiBlocks?: (event: AgentToolRoundUiBlocksEvent) => Promise<void>;
  /**
   * Sync-only today: fire-and-forget run tool-call accounting.
   */
  onRecordRunToolCall?: (summary: ToolCallSummary) => void;
  /**
   * Stream defers the unknown-tool failure until after `onToolStarted` so the
   * client sees a started→failed pair. Sync fails before started.
   */
  deferUnknownToolFailure?: boolean;
  /**
   * Sync logs a warning when tool arguments fail to parse; stream is silent.
   */
  logParseErrors?: boolean;
};

export type ExecuteToolRoundParams = {
  allowedToolNames: Set<CuratedActionName>;
  assistantContent: string | null;
  attachmentUrls?: string[];
  context: AgentChatContext;
  generationPriority: RouterPriority;
  messages: OpenRouterMessage[];
  model: string;
  policy: ResolvedAgentExecutionPolicy;
  source?: AgentChatRequest['source'];
  state: AgentToolRoundState;
  strategy?: AgentToolRoundStrategy;
  thinkingModel?: string;
  threadId: string;
  toolCalls: OpenRouterToolCallResponse[];
};

export type ExecuteToolRoundResult = {
  isCancelled: boolean;
  wasInterrupted?: boolean;
  terminalContent?: string;
  terminalToolName?: CuratedActionName;
};
