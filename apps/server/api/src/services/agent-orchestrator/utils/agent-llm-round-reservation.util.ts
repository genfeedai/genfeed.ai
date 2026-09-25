import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { normalizeResponseModel } from '@api/services/agent-orchestrator/utils/agent-response-model.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { ActivitySource } from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  calculateAgentExactCredits,
} from '@genfeedai/contracts/constants';

type ReservationCreditsClient = Pick<
  CreditsUtilsService,
  'releaseReservation' | 'reserveCredits' | 'settleReservation'
>;

export async function runReservedAgentLlmRound(params: {
  actorUserId: string;
  credits: ReservationCreditsClient;
  /**
   * Catalogue price for the round. `responseModel` is the model that answered,
   * normalized to its registry key (native clients may drop the provider
   * prefix); `requestedModel` is what was dispatched.
   */
  estimatedCredits: (models: {
    requestedModel: string;
    responseModel: string;
  }) => Promise<number>;
  idempotencyKey: string;
  maximumCredits: number;
  organizationId: string;
  requestedModel: string;
  run: () => Promise<OpenRouterChatCompletionResponse>;
  waived: boolean;
}): Promise<{ credits: number; response: OpenRouterChatCompletionResponse }> {
  const maximumCredits = params.waived ? 0 : Math.max(0, params.maximumCredits);
  if (maximumCredits === 0) {
    return { credits: 0, response: await params.run() };
  }

  const reservation = await params.credits.reserveCredits({
    actorUserId: params.actorUserId,
    amount: maximumCredits,
    idempotencyKey: params.idempotencyKey,
    organizationId: params.organizationId,
    workloadId: params.idempotencyKey,
    workloadType: 'agent-llm-round',
  });

  try {
    const response = await params.run();
    const usesExactCost =
      params.requestedModel === AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO ||
      params.requestedModel === AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE;
    const exactCredits =
      response.usage.is_byok === true
        ? 0
        : usesExactCost && typeof response.usage.cost === 'number'
          ? calculateAgentExactCredits(response.usage.cost)
          : await params.estimatedCredits({
              requestedModel: params.requestedModel,
              responseModel: normalizeResponseModel(
                params.requestedModel,
                response.model,
              ),
            });
    const credits = Math.max(0, exactCredits);

    await params.credits.settleReservation({
      actualAmount: credits,
      actorUserId: params.actorUserId,
      description: `Agent LLM round (${response.model ?? params.requestedModel})`,
      organizationId: params.organizationId,
      reservationId: reservation.id,
      source: ActivitySource.SCRIPT,
    });
    return { credits, response };
  } catch (error: unknown) {
    await params.credits
      .releaseReservation({
        organizationId: params.organizationId,
        reservationId: reservation.id,
      })
      .catch(() => undefined);
    throw error;
  }
}
