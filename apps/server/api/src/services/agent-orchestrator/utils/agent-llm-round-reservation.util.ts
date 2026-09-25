import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { AgentRoundPricer } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { normalizeResponseModel } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ActivitySource } from '@genfeedai/contracts';

type ReservationCreditsClient = Pick<
  CreditsUtilsService,
  | 'deductCreditsFromOrganization'
  | 'releaseReservation'
  | 'reserveCredits'
  | 'settleReservation'
>;

export const AGENT_LLM_ROUND_WORKLOAD_TYPE = 'agent-llm-round';
const AGENT_LLM_ROUND_OVERFLOW_REFERENCE_TYPE = 'agent_llm_round_overflow';

/** Where a settled round's provider USD came from. */
export type AgentRoundCostSource = 'byok' | 'provider_reported' | 'token_price';

export interface AgentLlmRoundResult {
  /** Exact fractional credits billed for the round. */
  credits: number;
  /** Raw provider charge in USD (0 for BYOK or waived rounds). */
  providerCostUsd: number;
  response: OpenRouterChatCompletionResponse;
}

/**
 * Reserve → run → settle for one agent LLM round.
 *
 * The hold is the round's maximum estimate. After the round, the bill is the
 * *actual* provider cost × margin, as fractional credits, for every model:
 * the provider-reported `usage.cost` when present (OpenRouter), otherwise the
 * answering model's $/1M token list price × reported usage (native
 * Anthropic/OpenAI). A BYOK round bills zero. A round that outgrew its hold
 * settles the hold in full and deducts the remainder with a matching
 * overdraft allowance — the inference already happened, so it is never
 * silently gifted.
 */
export async function runReservedAgentLlmRound(params: {
  actorUserId: string;
  credits: ReservationCreditsClient;
  idempotencyKey: string;
  maximumCredits: number;
  organizationId: string;
  pricer: AgentRoundPricer;
  requestedModel: string;
  run: () => Promise<OpenRouterChatCompletionResponse>;
  waived: boolean;
}): Promise<AgentLlmRoundResult> {
  const maximumCredits = params.waived ? 0 : Math.max(0, params.maximumCredits);
  if (maximumCredits === 0) {
    return { credits: 0, providerCostUsd: 0, response: await params.run() };
  }

  const reservation = await params.credits.reserveCredits({
    actorUserId: params.actorUserId,
    amount: maximumCredits,
    idempotencyKey: params.idempotencyKey,
    organizationId: params.organizationId,
    workloadId: params.idempotencyKey,
    workloadType: AGENT_LLM_ROUND_WORKLOAD_TYPE,
  });

  let response: OpenRouterChatCompletionResponse;
  try {
    response = await params.run();
  } catch (error: unknown) {
    await params.credits
      .releaseReservation({
        organizationId: params.organizationId,
        reservationId: reservation.id,
      })
      .catch(() => undefined);
    throw error;
  }

  const usage = response.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const answeringModel = normalizeResponseModel(
    params.requestedModel,
    response.model,
  );
  const costSource: AgentRoundCostSource =
    usage?.is_byok === true
      ? 'byok'
      : typeof usage?.cost === 'number' && Number.isFinite(usage.cost)
        ? 'provider_reported'
        : 'token_price';
  const providerCostUsd =
    costSource === 'byok'
      ? 0
      : costSource === 'provider_reported'
        ? Math.max(0, usage.cost ?? 0)
        : await params.pricer.calculateRoundProviderCostUsd({
            completionTokens,
            promptTokens,
            requestedModel: params.requestedModel,
            responseModel: answeringModel,
          });
  const credits =
    costSource === 'byok' ? 0 : params.pricer.toRoundCredits(providerCostUsd);
  const heldCredits = reservation.amount ?? maximumCredits;
  const settledCredits = Math.min(credits, heldCredits);
  const overflowCredits = Number((credits - settledCredits).toFixed(6));
  const description = `Agent LLM round (${response.model ?? params.requestedModel})`;
  // Never prompt or completion text — model, tokens, and cost only.
  const metadata = {
    completionTokens,
    costSource,
    exactCredits: credits,
    model: answeringModel,
    promptTokens,
    providerCostUsd,
    requestedModel: params.requestedModel,
    workloadType: AGENT_LLM_ROUND_WORKLOAD_TYPE,
  };

  await params.credits.settleReservation({
    actualAmount: settledCredits,
    actorUserId: params.actorUserId,
    description,
    metadata,
    organizationId: params.organizationId,
    reservationId: reservation.id,
    source: ActivitySource.AGENT_CHAT,
  });

  if (overflowCredits > 0) {
    await params.credits.deductCreditsFromOrganization(
      params.organizationId,
      params.actorUserId,
      overflowCredits,
      `${description} — beyond hold`,
      ActivitySource.AGENT_CHAT,
      {
        idempotencyKey: `${params.idempotencyKey}:overflow`,
        maxOverdraftCredits: overflowCredits,
        metadata: { ...metadata, isOverflow: true },
        referenceId: reservation.id,
        referenceType: AGENT_LLM_ROUND_OVERFLOW_REFERENCE_TYPE,
      },
    );
  }

  return { credits, providerCostUsd, response };
}
