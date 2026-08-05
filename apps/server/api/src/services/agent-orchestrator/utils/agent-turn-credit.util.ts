import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { getAgentChatModelRoundCredits } from '@genfeedai/constants';
import { ActivitySource } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';

/**
 * Credits burned by one LLM round, charged against the model that actually
 * answered rather than the one that was requested. OpenRouter is free to serve
 * a different — usually pricier — model than we asked for, so pricing the
 * request instead of the response is how we ended up eating the difference.
 *
 * A `turnCost` of zero marks a turn waived upfront (brand interview, billed
 * once by `BrandInterviewService.start`); every round inside it stays free.
 */
export function resolveAgentRoundCreditCost(params: {
  actualModel: string;
  turnCost: number;
}): number {
  return params.turnCost > 0
    ? getAgentChatModelRoundCredits(params.actualModel)
    : 0;
}

/**
 * Ledger description for the turn. Names every model that served a round, so a
 * turn that OpenRouter spread across two models reads as what it charged for.
 */
export function describeBilledModels(
  requestedModel: string,
  actualModels?: string[],
): string {
  const billedModels = (actualModels ?? []).filter(
    (model) => model.trim().length > 0,
  );

  return billedModels.length > 0 ? billedModels.join(', ') : requestedModel;
}

export function resolveAgentTurnCreditCost(
  roundCredits: number,
  toolCalls: ToolCallSummary[],
): number {
  const builtBrandProfile = toolCalls.some(
    (toolCall) =>
      toolCall.toolName === AgentToolName.DRAFT_BRAND_VOICE_PROFILE &&
      toolCall.status === 'completed',
  );

  return builtBrandProfile ? 0 : roundCredits;
}

export async function settleAgentTurnCredits(params: {
  /** Models that actually served the turn's rounds, in order. */
  actualModels?: string[];
  creditsUtilsService: Pick<
    CreditsUtilsService,
    'deductCreditsFromOrganization'
  >;
  model: string;
  organizationId: string;
  /** Sum of every round already run, priced per round. */
  roundCredits: number;
  toolCalls: ToolCallSummary[];
  userId: string;
}): Promise<number> {
  const billedTurnCost = resolveAgentTurnCreditCost(
    params.roundCredits,
    params.toolCalls,
  );
  if (billedTurnCost > 0) {
    await params.creditsUtilsService.deductCreditsFromOrganization(
      params.organizationId,
      params.userId,
      billedTurnCost,
      `Agent chat turn (${describeBilledModels(params.model, params.actualModels)})`,
      ActivitySource.SCRIPT,
    );
  }
  return billedTurnCost;
}
