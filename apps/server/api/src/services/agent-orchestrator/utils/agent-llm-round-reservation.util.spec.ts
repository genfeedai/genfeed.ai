import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import { runReservedAgentLlmRound } from '@api/services/agent-orchestrator/utils/agent-llm-round-reservation.util';
import type { OpenRouterChatCompletionResponse } from '@api/services/integrations/openrouter/dto/openrouter.dto';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentExactCredits,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

describe('runReservedAgentLlmRound', () => {
  it('holds the maximum and idempotently settles exact Auto cost', async () => {
    const credits = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      settleReservation: vi.fn(),
    };
    const response = {
      choices: [],
      id: 'gen-1',
      model: 'anthropic/claude-sonnet-5',
      usage: {
        completion_tokens: 20,
        cost: 0.012345,
        is_byok: false,
        prompt_tokens: 10,
        total_tokens: 30,
      },
    };

    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      estimatedCredits: vi.fn().mockResolvedValue(99),
      idempotencyKey: 'run-1:agent-llm-round:1',
      maximumCredits: 30,
      organizationId: 'org-1',
      requestedModel: 'openrouter/auto',
      run: vi.fn().mockResolvedValue(response),
      waived: false,
    });

    expect(credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 30,
        idempotencyKey: 'run-1:agent-llm-round:1',
      }),
    );
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: calculateAgentExactCredits(0.012345),
        reservationId: 'reservation-1',
      }),
    );
    expect(result.credits).toBe(calculateAgentExactCredits(0.012345));
  });

  it('releases the hold when the provider fails', async () => {
    const credits = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      settleReservation: vi.fn(),
    };

    await expect(
      runReservedAgentLlmRound({
        actorUserId: 'user-1',
        credits,
        estimatedCredits: vi.fn().mockResolvedValue(1),
        idempotencyKey: 'round-1',
        maximumCredits: 10,
        organizationId: 'org-1',
        requestedModel: 'openrouter/auto',
        run: vi.fn().mockRejectedValue(new Error('provider failed')),
        waived: false,
      }),
    ).rejects.toThrow('provider failed');
    expect(credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
  });
});

describe('runReservedAgentLlmRound catalogue settlement', () => {
  const catalogCredits = (key: string): number => {
    const model = AGENT_CHAT_MODELS.find((entry) => entry.key === key);
    if (!model) {
      throw new Error(`${key} is not catalogued`);
    }
    return model.creditCostPerRound;
  };

  const createRegistry = async () => {
    const registry = new AgentChatModelRegistryService(
      {
        model: {
          findMany: vi.fn().mockResolvedValue(
            AGENT_CHAT_MODELS.map((model) => ({
              cost: model.creditCostPerRound,
              isActive: true,
              isDefault: model.key === AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
              isDiscovered: false,
              isFree: model.isFree ?? false,
              key: model.key,
              label: model.label,
              lifecycle: ModelLifecycle.RECOMMENDED,
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

  const nativeResponse = (
    model: string,
    isByok: boolean,
  ): OpenRouterChatCompletionResponse => ({
    choices: [],
    id: 'msg-1',
    model,
    usage: {
      completion_tokens: 20,
      is_byok: isByok,
      prompt_tokens: 10,
      total_tokens: 30,
    },
  });

  const settle = async (params: {
    isByok?: boolean;
    requestedModel: string;
    responseModel: string;
  }) => {
    const registry = await createRegistry();
    const credits = {
      releaseReservation: vi.fn().mockResolvedValue(undefined),
      reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
      settleReservation: vi.fn(),
    };
    const result = await runReservedAgentLlmRound({
      actorUserId: 'user-1',
      credits,
      estimatedCredits: (models) => registry.getSettledRoundCredits(models),
      idempotencyKey: 'run-1:agent-llm-round:1',
      maximumCredits: await registry.getMaximumRoundCredits(
        params.requestedModel,
      ),
      organizationId: 'org-1',
      requestedModel: params.requestedModel,
      run: vi
        .fn()
        .mockResolvedValue(
          nativeResponse(params.responseModel, params.isByok ?? false),
        ),
      waived: false,
    });
    expect(credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({ actualAmount: result.credits }),
    );
    return result.credits;
  };

  it.each([
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5, 'anthropic/claude-sonnet-5'],
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5, 'claude-sonnet-5'],
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, 'anthropic/claude-opus-5'],
    [AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5, 'claude-opus-5'],
  ])(
    'bills native Anthropic %s answered as %s at its catalogue price',
    async (requestedModel, responseModel) => {
      const credits = await settle({ requestedModel, responseModel });

      expect(credits).toBe(catalogCredits(requestedModel));
      expect(credits).toBeGreaterThan(
        catalogCredits(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH),
      );
    },
  );

  it('bills native OpenAI at its catalogue price', async () => {
    await expect(
      settle({
        requestedModel: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
        responseModel: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA));
  });

  it('bills zero credits for a native round served with the org BYOK key', async () => {
    await expect(
      settle({
        isByok: true,
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
        responseModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
      }),
    ).resolves.toBe(0);
  });

  it('bills a platform-key native round', async () => {
    await expect(
      settle({
        isByok: false,
        requestedModel: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
        responseModel: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
      }),
    ).resolves.not.toBe(0);
  });

  it('bills an unknown model at the highest catalogue price', async () => {
    await expect(
      settle({
        requestedModel: 'vendor/brand-new',
        responseModel: 'vendor/brand-new',
      }),
    ).resolves.toBe(
      Math.max(
        AGENT_FALLBACK_ROUND_CREDITS,
        ...AGENT_CHAT_MODELS.map((model) => model.creditCostPerRound),
      ),
    );
  });
});
