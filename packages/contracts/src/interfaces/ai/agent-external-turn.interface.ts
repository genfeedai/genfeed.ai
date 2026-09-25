import type { AgentExternalRuntimeKey } from '../../constants/agent-external-runtime.constant';

/** One tool invocation made by an external CLI runtime during a turn. */
export interface IAgentExternalTurnToolCall {
  /** Short, redacted summary of the tool arguments. */
  argsSummary?: string;
  durationMs?: number;
  error?: string;
  /** Tool name without the MCP server prefix (e.g. `get_brand_context`). */
  name: string;
  resultSummary?: string;
  status: 'completed' | 'failed';
}

/** Token/cost usage reported by the external CLI (informational only). */
export interface IAgentExternalTurnUsage {
  cachedInputTokens?: number;
  /** Cost reported by the CLI against the user's own subscription. */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * A turn executed outside Genfeed (on the user's own CLI subscription) and
 * appended to a Genfeed thread afterwards. Never billed in Genfeed credits.
 */
export interface IAgentExternalTurnInput {
  assistantMessage: string;
  completedAt?: string;
  model?: string;
  runtimeKey: AgentExternalRuntimeKey;
  /** CLI session id to resume on the next turn of this thread. */
  sessionId?: string;
  startedAt?: string;
  toolCalls?: IAgentExternalTurnToolCall[];
  usage?: IAgentExternalTurnUsage;
  userMessage: string;
}

/** Persisted in `AgentThread.config.externalRuntime`. */
export interface IAgentThreadExternalRuntime {
  runtimeKey: AgentExternalRuntimeKey;
  sessionId: string | null;
  updatedAt: string;
}
