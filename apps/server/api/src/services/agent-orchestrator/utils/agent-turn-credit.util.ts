import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { AgentToolName } from '@genfeedai/interfaces';

export function resolveAgentTurnCreditCost(
  turnCost: number,
  toolCalls: ToolCallSummary[],
): number {
  const builtBrandProfile = toolCalls.some(
    (toolCall) =>
      toolCall.toolName === AgentToolName.DRAFT_BRAND_VOICE_PROFILE &&
      toolCall.status === 'completed',
  );

  return builtBrandProfile ? 0 : turnCost;
}
