import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { ResolvedAgentExecutionPolicy } from '@api/services/agent-orchestrator/interfaces/agent-execution-policy.interface';
import type { AgentToolExecutorService } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';

export interface BatchTurnParams {
  context: AgentChatContext;
  model: string;
  policy: ResolvedAgentExecutionPolicy;
  requestContent: string;
  seedTitle: string;
  startedAt: string;
  threadId: string;
}

export type BatchToolResult = Awaited<
  ReturnType<AgentToolExecutorService['executeTool']>
>;
