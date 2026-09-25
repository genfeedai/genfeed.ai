import type { AgentMemoryDocument } from '@api/collections/agent-memories/schemas/agent-memory.schema';
import type { PreparedAgentScope } from '@api/index';
import type { AssembledBrandContext } from '@api/services/agent-context-assembly/interfaces/context-assembly.interface';
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
