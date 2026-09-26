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
        findMany: vi.fn().mockResolvedValue(
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
        ),
      },
    } as unknown as PrismaService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
  await registry.refresh();
  return registry;
};

const createCredits = (reservedAmount?: number) => ({
  deductCreditsFromOrganization: vi.fn().mockResolvedValue(undefined),
  releaseReservation: vi.fn().mockResolvedValue(undefined),
  reserveCredits: vi.fn().mockImplementation(({ amount }: { amount: number }) =>
    Promise.resolve({
      amount: reservedAmount ?? amount,
      id: 'reservation-1',
    }),
  ),
  settleReservation: vi.fn().mockResolvedValue(undefined),
});

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
      credits,
      idempotencyKey: 'run-1:agent-llm-round:1',
      maximumCredits: 30,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
      run: vi
        .fn()
        .mockResolvedValue(
          response(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH, { cost: 0.000842 }),
        ),
      waived: false,
    });

    const expected = calculateAgentExactCredits(0.000842);
    expect(expected).toBeLessThan(1);
    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30,
        idempotencyKey: 'run-1:agent-llm-round:1',
        workloadType: 'agent-llm-round',
      }),
    );
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: expected,
        metadata: expect.objectContaining({
          costSource: 'provider_reported',
          model: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
          promptTokens: 10_000,
          providerCostUsd: 0.000842,
        }),
        reservationId: 'reservation-1',
        source: ActivitySource.AGENT_CHAT,
      }),
    );
    expect(credits.deductCreditsFromOrganization).not.toHaveBeenCalled();
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
      credits,
      idempotencyKey: 'round-1',
      maximumCredits: 30,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
      run: vi
        .fn()
        .mockResolvedValue(
          response(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5, { cost: 0.01 }),
        ),
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
        credits,
        idempotencyKey: 'round-1',
        maximumCredits: 50,
        organizationId: 'org-1',
        pricer: registry,
        requestedModel,
        run: vi.fn().mockResolvedValue(response(responseModel, usage)),
        waived: false,
      });

      const providerCostUsd = calculateAgentProviderCostUsd(
        pricingOf(requestedModel),
        { completionTokens: 1_234, promptTokens: 5_678 },
      );
      expect(result.providerCostUsd).toBeCloseTo(providerCostUsd, 12);
      expect(result.credits).toBe(calculateAgentExactCredits(providerCostUsd));
      expect(credits.settleReservation).toHaveBeenCalledWith(
        expect.objectContaining({
          actualAmount: result.credits,
          metadata: expect.objectContaining({ costSource: 'token_price' }),
        }),
      );
    },
  );

  it('bills zero credits for a BYOK round even when the provider reports a cost', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      idempotencyKey: 'round-1',
      maximumCredits: 50,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
      run: vi.fn().mockResolvedValue(
        response(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, {
          cost: 0.2,
          is_byok: true,
        }),
      ),
      waived: false,
    });

    expect(result).toEqual(
      expect.objectContaining({ credits: 0, providerCostUsd: 0 }),
    );
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 0,
        metadata: expect.objectContaining({ costSource: 'byok' }),
      }),
    );
  });

  it('settles the full hold and deducts the overflow when a round outgrows it', async () => {
    const registry = await createRegistry();
    const credits = createCredits(1);

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      idempotencyKey: 'run-1:agent-llm-round:2',
      maximumCredits: 1,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
      run: vi
        .fn()
        .mockResolvedValue(
          response(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, { cost: 0.05 }),
        ),
      waived: false,
    });

    const exact = calculateAgentExactCredits(0.05);
    expect(result.credits).toBe(exact);
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: 1 }),
    );
    expect(credits.deductCreditsFromOrganization).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      Number((exact - 1).toFixed(6)),
      expect.stringContaining('beyond hold'),
      ActivitySource.AGENT_CHAT,
      expect.objectContaining({
        idempotencyKey: 'run-1:agent-llm-round:2:overflow',
        maxOverdraftCredits: Number((exact - 1).toFixed(6)),
      }),
    );
  });

  it('runs a waived round without touching the ledger', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      idempotencyKey: 'round-1',
      maximumCredits: 10,
      organizationId: 'org-1',
      pricer: registry,
      requestedModel: AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
      run: vi
        .fn()
        .mockResolvedValue(
          response(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH, { cost: 0.001 }),
        ),
      waived: true,
    });

    expect(result.credits).toBe(0);
    expect(credits.reserveCredits).not.toHaveBeenCalled();
  });

  it('releases the hold when the provider fails', async () => {
    const registry = await createRegistry();
    const credits = createCredits();

    await expect(
      runReservedAgentLlmRound({
        actorUserId: 'user-1',
        credits,
        idempotencyKey: 'round-1',
        maximumCredits: 10,
        organizationId: 'org-1',
        pricer: registry,
        requestedModel: AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
        run: vi.fn().mockRejectedValue(new Error('provider failed')),
        waived: false,
      }),
    ).rejects.toThrow('provider failed');
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(credits.settleReservation).not.toHaveBeenCalled();
  });
});
