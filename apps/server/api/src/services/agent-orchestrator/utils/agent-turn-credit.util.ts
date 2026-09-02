import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolCallSummary } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { ActivitySource } from '@genfeedai/enums';
import { AgentToolName } from '@genfeedai/interfaces';

/**
 * Credits burned by one LLM round, charged against the model that actually
 * answered rather than the one that was requested. OpenRouter is free to serve
 * a different — usually pricier — model than we asked for, so pricing the
 * request instead of the response is how we ended up eating the difference.
 *
 * Round cost is resolved from the model registry (DB) by the caller — this
 * helper only applies the turn-cost waiver.
 *
 * A `turnCost` of zero marks a turn waived upfront (brand interview, billed
 * once by `BrandInterviewService.start`); every round inside it stays free.
 */
export function resolveAgentRoundCreditCost(params: {
  actualModel: string;
  /** Registry-priced credits for `actualModel` (one LLM round). */
  roundCreditsForModel: number;
  turnCost: number;
}): number {
  return params.turnCost > 0 ? Math.max(0, params.roundCreditsForModel) : 0;
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

export function resolveAgentNextRoundCreditRequirement(params: {
  nextRoundCredits: number;
  roundCredits: number;
  toolCalls: ToolCallSummary[];
}): number {
  return resolveAgentTurnCreditCost(
    params.roundCredits + params.nextRoundCredits,
    params.toolCalls,
  );
}

export async function settleAgentTurnCredits(params: {
  /** Models that actually served the turn's rounds, in order. */
  actualModels?: string[];
  creditsUtilsService: Pick<
    CreditsUtilsService,
    'deductCreditsFromOrganization' | 'getOrganizationCreditsBalance'
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
    const currentBalance =
      await params.creditsUtilsService.getOrganizationCreditsBalance(
        params.organizationId,
      );
    const maxOverdraftCredits = Math.max(0, billedTurnCost - currentBalance);
    const description = `Agent chat turn (${describeBilledModels(params.model, params.actualModels)})`;

    if (maxOverdraftCredits > 0) {
      // The provider response has already been consumed by the time its actual
      // model is known. Permit only that unavoidable, measured shortfall; the
      // loop preflights requested-model estimates before starting later rounds.
      await params.creditsUtilsService.deductCreditsFromOrganization(
        params.organizationId,
        params.userId,
        billedTurnCost,
        description,
        ActivitySource.SCRIPT,
        { maxOverdraftCredits },
      );
    } else {
      await params.creditsUtilsService.deductCreditsFromOrganization(
        params.organizationId,
        params.userId,
        billedTurnCost,
        description,
        ActivitySource.SCRIPT,
      );
    }
  }
  return billedTurnCost;
}
