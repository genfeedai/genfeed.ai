import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { ActivitySource } from '@genfeedai/enums';
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

export async function settleAgentTurnCredits(params: {
  creditsUtilsService: Pick<
    CreditsUtilsService,
    'deductCreditsFromOrganization'
  >;
  model: string;
  organizationId: string;
  toolCalls: ToolCallSummary[];
  turnCost: number;
  userId: string;
}): Promise<number> {
  const billedTurnCost = resolveAgentTurnCreditCost(
    params.turnCost,
    params.toolCalls,
  );
  if (billedTurnCost > 0) {
    await params.creditsUtilsService.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      billedTurnCost,
      `Agent chat turn (${params.model})`,
      ActivitySource.SCRIPT,
    );
  }
  return billedTurnCost;
}
