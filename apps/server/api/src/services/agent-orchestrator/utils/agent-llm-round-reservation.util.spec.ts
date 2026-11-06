import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ModelLifecycle,
  ModelProvider,
} from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  calculateAgentExactCredits,
  calculateAgentProviderCostUsd,
} from '@genfeedai/contracts/constants';
import {
  getRuntimeAgentChatMarginMultiplier,
  setRuntimeAgentChatMarginMultiplier,
} from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';

const createRegistry = async () => {
  const registry = new AgentChatModelRegistryService(
    {
      model: {
        findMany: async () =>
          AGENT_CHAT_MODELS.map((model) => ({
            cost: model.creditCostPerRound,
            inputCostPerMillionTokens: model.pricing.promptPerMillion,
            isActive: true,
            isDefault: model.key === AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
            isDiscovered: false,
            isFree: model.isFree ?? false,
            key: model.key,
            label: model.label,
            lifecycle: ModelLifecycle.RECOMMENDED,
            outputCostPerMillionTokens: model.pricing.completionPerMillion,
            provider: ModelProvider.OPENROUTER,
            reviewStatus: null,
            succeededBy: null,
            supportsFeatures: [],
          })),
      },
    } as unknown as PrismaService,
    { warn: () => undefined } as unknown as LoggerService,
  );
  await registry.refresh();
  return registry;
};

interface Reservation {
  actualAmount?: number;
  amount: number;
  brandId?: string;
  costSource?: unknown;
  id: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  source?: string;
  status: 'held' | 'released' | 'settled';
  workloadType: string;
}

interface Deduction {
  amount: number;
  description: string;
  options: Record<string, unknown>;
  source: string;
}

/**
 * The organization's credit ledger: reservations move held → settled or
 * released; deductions beyond a hold are recorded separately. `grantedHold`
 * caps what a reservation can hold, like a balance near zero does.
 */
const createCredits = (grantedHold?: number) => {
  const reservations: Reservation[] = [];
  const deductions: Deduction[] = [];
  const find = (id: string) => {
    const reservation = reservations.find((item) => item.id === id);
    if (reservation?.status !== 'held') {
      throw new Error(`Reservation ${id} is not held`);
    }
    return reservation;
  };
  const client = {
    deductCreditsFromOrganization: async (
      _org: string,
      _user: string,
      amount: number,
      description: string,
      source: string,
      options: Record<string, unknown>,
    ) => {
      deductions.push({ amount, description, options, source });
    },
    releaseReservation: async ({
      reservationId,
    }: {
      reservationId: string;
    }) => {
      find(reservationId).status = 'released';
    },
    reserveCredits: async (input: {
      amount: number;
      brandId?: string | null;
      idempotencyKey: string;
      workloadType: string;
    }) => {
      const reservation: Reservation = {
        amount: grantedHold ?? input.amount,
        brandId: input.brandId ?? undefined,
        id: `reservation-${reservations.length + 1}`,
        idempotencyKey: input.idempotencyKey,
        status: 'held',
        workloadType: input.workloadType,
      };
      reservations.push(reservation);
      return { amount: reservation.amount, id: reservation.id };
    },
    settleReservation: async (input: {
      actualAmount: number;
      metadata: Record<string, unknown>;
      reservationId: string;
      source: string;
    }) => {
      Object.assign(find(input.reservationId), {
        actualAmount: input.actualAmount,
        metadata: input.metadata,
        source: input.source,
        status: 'settled',
      });
    },
  };
  return {
    client: client as unknown as Parameters<
      typeof runReservedAgentLlmRound
    >[0]['credits'],
    deductions,
    reservations,
  };
};

const response = (
  model: string,
  usage: Partial<OpenRouterChatCompletionResponse['usage']>,
): OpenRouterChatCompletionResponse => ({
  choices: [],
  id: 'gen-1',
  model,
  usage: {
    completion_tokens: 2_000,
    is_byok: false,
    prompt_tokens: 10_000,
    total_tokens: 12_000,
    ...usage,
  },
});

const pricingOf = (key: string) => {
  const pricing = AGENT_CHAT_MODELS.find((model) => model.key === key)?.pricing;
  if (!pricing) {
    throw new Error(`${key} is not catalogued`);
  }
  return pricing;
};

describe('runReservedAgentLlmRound exact-cost settlement', () => {
  const initialMargin = getRuntimeAgentChatMarginMultiplier();

  afterEach(() => {
    setRuntimeAgentChatMarginMultiplier(initialMargin);
  });

  it('holds the maximum, then settles OpenRouter usage.cost × margin as fractional credits', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits: credits.client,
      idempotencyKey: 'run-1:agent-llm-round:1',
      maximumCredits: 30,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
      run: async () =>
        response(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH, { cost: 0.000842 }),
      waived: false,
    });

    const expected = calculateAgentExactCredits(0.000842);
    expect(expected).toBeLessThan(1);
    expect(credits.reservations).toEqual([
      expect.objectContaining({
        actualAmount: expected,
        amount: 30,
        idempotencyKey: 'run-1:agent-llm-round:1',
        metadata: expect.objectContaining({
          costSource: 'provider_reported',
          model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
          promptTokens: 10_000,
          providerCostUsd: 0.000842,
        }),
        source: ActivitySource.AGENT_CHAT,
        status: 'settled',
        workloadType: 'agent-llm-round',
      }),
    ]);
    expect(credits.deductions).toEqual([]);
    expect(result).toEqual(
      expect.objectContaining({ credits: expected, providerCostUsd: 0.000842 }),
    );
  });

  it('applies the operator margin knob to provider cost', async () => {
    const registry = await createRegistry();
    const credits = createCredits();
    setRuntimeAgentChatMarginMultiplier(1.5);

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits: credits.client,
      idempotencyKey: 'round-1',
      maximumCredits: 30,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
      run: async () =>
        response(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5, { cost: 0.01 }),
      waived: false,
    });

    expect(result.credits).toBe(calculateAgentExactCredits(0.01, 1.5));
    expect(result.credits).toBeCloseTo(0.01 * 1.5 * 100, 6);
  });

  it.each([
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5, 'claude-sonnet-5'],
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, 'anthropic/claude-opus-5'],
    [AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA, 'openai/gpt-5.6-terra'],
  ])(
    'prices a native %s round (answered as %s) from usage tokens × catalogue $/1M',
    async (requestedModel, responseModel) => {
      const registry = await createRegistry();
      const credits = createCredits();
      const usage = { completion_tokens: 1_234, prompt_tokens: 5_678 };

      const result = await runReservedAgentLlmRound({
        actorUserId: 'user-1',
        credits: credits.client,
        idempotencyKey: 'round-1',
        maximumCredits: 50,
        organizationId: 'org-1',
        pricer: registry,
        requestedModel,
        run: async () => response(responseModel, usage),
        waived: false,
      });

      const providerCostUsd = calculateAgentProviderCostUsd(
        pricingOf(requestedModel),
        { completionTokens: 1_234, promptTokens: 5_678 },
      );
      expect(result.providerCostUsd).toBeCloseTo(providerCostUsd, 12);
      expect(result.credits).toBe(calculateAgentExactCredits(providerCostUsd));
      expect(credits.reservations).toEqual([
        expect.objectContaining({
          actualAmount: result.credits,
          metadata: expect.objectContaining({ costSource: 'token_price' }),
          status: 'settled',
        }),
      ]);
    },
  );

  it('bills zero credits for a BYOK round even when the provider reports a cost', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits: credits.client,
      idempotencyKey: 'round-1',
      maximumCredits: 50,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
      run: async () =>
        response(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, {
          cost: 0.2,
          is_byok: true,
        }),
      waived: false,
    });

    expect(result).toEqual(
      expect.objectContaining({ credits: 0, providerCostUsd: 0 }),
    );
    expect(credits.reservations).toEqual([
      expect.objectContaining({
        actualAmount: 0,
        metadata: expect.objectContaining({ costSource: 'byok' }),
        status: 'settled',
      }),
    ]);
  });

  it('settles the full hold and deducts the overflow when a round outgrows it', async () => {
    const registry = await createRegistry();
    const credits = createCredits(1);

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      brandId: 'brand-1',
      credits: credits.client,
      idempotencyKey: 'run-1:agent-llm-round:2',
      maximumCredits: 1,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
      run: async () =>
        response(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, { cost: 0.05 }),
      waived: false,
    });

    const exact = calculateAgentExactCredits(0.05);
    expect(result.credits).toBe(exact);
    expect(credits.reservations).toEqual([
      expect.objectContaining({
        actualAmount: 1,
        amount: 1,
        brandId: 'brand-1',
        status: 'settled',
      }),
    ]);
    const overflow = Number((exact - 1).toFixed(6));
    expect(credits.deductions).toEqual([
      {
        amount: overflow,
        description: expect.stringContaining('beyond hold'),
        options: expect.objectContaining({
          brandId: 'brand-1',
          idempotencyKey: 'run-1:agent-llm-round:2:overflow',
          maxOverdraftCredits: overflow,
          referenceId: 'reservation-1',
        }),
        source: ActivitySource.AGENT_CHAT,
      },
    ]);
  });

  it('runs a waived round without touching the ledger', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits: credits.client,
      idempotencyKey: 'round-1',
      maximumCredits: 10,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
      run: async () =>
        response(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH, { cost: 0.001 }),
      waived: true,
    });

    expect(result.credits).toBe(0);
    expect(credits.reservations).toEqual([]);
    expect(credits.deductions).toEqual([]);
  });

  it('releases the hold when the provider fails', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    await expect(
      runReservedAgentLlmRound({
        actorUserId: 'user-1',
        credits: credits.client,
        idempotencyKey: 'round-1',
        maximumCredits: 10,
        organizationId: 'org-1',
        pricer: registry,
        requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
        run: async () => {
          throw new Error('provider failed');
        },
        waived: false,
      }),
    ).rejects.toThrow('provider failed');
    expect(credits.reservations).toEqual([
      expect.objectContaining({ id: 'reservation-1', status: 'released' }),
    ]);
    expect(credits.reservations[0]).not.toHaveProperty('actualAmount');
  });
});
