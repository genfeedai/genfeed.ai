import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type { PreparedAgentScope } from '@api/index';
import type { AssembledBrandContext } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
import type { AgentTypeConfig } from '@api/services/agent-orchestrator/constants/agent-type-config.constant';
import type { AgentChatRequest } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { ResolvedRuntimeSkill } from '@genfeedai/contracts/interfaces/ai';

/**
 * Everything `AgentOrchestratorContextService.resolveTurnContext` resolves for
 * one chat turn. `brandContext` is the assembled layer data the system prompt
 * was rendered from (null when the turn loads no brand context).
 */
export interface ResolvedAgentTurnContext {
  brandContext: AssembledBrandContext | null;
  memories: AgentMemoryDocument[];
  model: string | undefined;
  policy: ResolvedAgentExecutionPolicy;
  preparedScope: PreparedAgentScope;
  /** Organization reply style applied to the brand-context block. */
  replyStyle?: string;
  resolvedSkills: ResolvedRuntimeSkill[];
  systemPrompt: string | undefined;
}

/**
 * What the chat turn runs on: the turn context without the snapshot-only
 * brand layers, with the free-tier lock applied to `model` and `policy`.
 */
export interface ResolvedAgentChatTurn
  extends Omit<
    ResolvedAgentTurnContext,
    'brandContext' | 'model' | 'replyStyle'
  > {
  model: string;
}

/** Inputs that select and compose one turn's system prompt. */
export interface AgentTurnSystemPromptInput {
  agentTypeConfig: AgentTypeConfig | null;
  brandContext: AssembledBrandContext | null;
  brandId?: string;
  replyStyle?: string;
  request: AgentChatRequest;
  skillPromptSuffix: string;
  /** The persisted thread's own system prompt, when it has one. */
  threadSystemPrompt?: string;
}
