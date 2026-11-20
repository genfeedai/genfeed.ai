import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentExactCredits,
  calculateAgentProviderCostUsd,
  REASONING_FEATURE,
} from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';

const row = (overrides: Record<string, unknown>) => ({
  cost: 4,
  isActive: true,
  isDefault: false,
  isDiscovered: false,
  isFree: false,
  key: 'provider/model',
  label: 'Model',
  lifecycle: ModelLifecycle.AVAILABLE,
  provider: ModelProvider.OPENROUTER,
  reviewStatus: null,
  supportsFeatures: [],
  ...overrides,
});

describe('AgentChatModelRegistryService', () => {
  it('keeps Legacy explicit, hides Retired, and stops on a Retired key', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          row({
            key: 'legacy',
            lifecycle: ModelLifecycle.LEGACY,
          }),
          row({
            isActive: false,
            key: 'retired',
            label: 'Old Model',
            lifecycle: ModelLifecycle.RETIRED,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.listSelectable()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'recommended' }),
        expect.objectContaining({ key: 'legacy' }),
      ]),
    );
    expect(
      (await service.listSelectable()).map((model) => model.key),
    ).not.toContain('retired');
    await expect(service.resolveModelKey('retired')).rejects.toThrow(
      'The model Old Model was retired. Pick a new model, then run it again.',
    );
    await expect(service.resolveModelKey('legacy')).resolves.toBe('legacy');
  });

  it('limits Auto to reviewed, priced Recommended models', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          row({ key: 'available', lifecycle: ModelLifecycle.AVAILABLE }),
          row({
            cost: 0,
            key: 'unpriced',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
          row({
            isDiscovered: true,
            key: 'pending',
            lifecycle: ModelLifecycle.RECOMMENDED,
            reviewStatus: 'pending',
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.getAutoAllowedModelKeys()).resolves.toEqual([
      'recommended',
    ]);
  });

  it('exposes the same rows behind the Auto allow-list, with reasoning flagged', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            cost: 9,
            key: 'reasoner',
            lifecycle: ModelLifecycle.RECOMMENDED,
            supportsFeatures: [REASONING_FEATURE],
          }),
          row({ cost: 2, key: 'plain', lifecycle: ModelLifecycle.RECOMMENDED }),
          row({ key: 'available', lifecycle: ModelLifecycle.AVAILABLE }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    const candidates = await service.listAutoCandidates();

    expect(candidates.map((candidate) => candidate.key).sort()).toEqual(
      await service.getAutoAllowedModelKeys(),
    );
    expect(
      candidates.find((candidate) => candidate.key === 'reasoner')?.isReasoning,
    ).toBe(true);
    expect(
      candidates.find((candidate) => candidate.key === 'plain')?.isReasoning,
    ).toBe(false);
  });

  it('uses the Admin isDefault text row even when it is not Recommended', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            cost: 40,
            isDefault: false,
            key: 'anthropic/claude-sonnet-5',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
          row({
            cost: 1,
            isDefault: true,
            key: 'deepseek/deepseek-v4.1-flash-1017',
            lifecycle: ModelLifecycle.AVAILABLE,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.getDefaultModelKey()).resolves.toBe(
      'deepseek/deepseek-v4.1-flash-1017',
    );
    await expect(service.resolveModelKey(undefined)).resolves.toBe(
      'deepseek/deepseek-v4.1-flash-1017',
    );
  });

  it('never returns a retired isDefault row as the default', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            cost: 40,
            isActive: true,
            isDefault: true,
            key: 'anthropic/claude-legacy',
            lifecycle: ModelLifecycle.RETIRED,
          }),
          row({
            cost: 4,
            isDefault: false,
            key: 'anthropic/claude-sonnet-5',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.getDefaultModelKey()).resolves.toBe(
      'anthropic/claude-sonnet-5',
    );
    await expect(service.resolveModelKey(undefined)).resolves.toBe(
      'anthropic/claude-sonnet-5',
    );
  });

  it('falls back to the cheapest selectable row when the default is retired', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            cost: 40,
            isActive: true,
            isDefault: true,
            key: 'anthropic/claude-legacy',
            lifecycle: ModelLifecycle.RETIRED,
          }),
          row({
            cost: 9,
            isDefault: false,
            key: 'available',
            lifecycle: ModelLifecycle.AVAILABLE,
          }),
          row({
            cost: 2,
            isDefault: false,
            key: 'recommended',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(service.getDefaultModelKey()).resolves.toBe('recommended');
  });

  it('uses a caller-supplied fallback key only when no active row is available', async () => {
    const prisma = { model: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(
      service.getDefaultModelKey('google/gemini-3.8-flash'),
    ).resolves.toBe('google/gemini-3.8-flash');
    await expect(
      service.resolveModelKey(undefined, 'google/gemini-3.8-flash'),
    ).resolves.toBe('google/gemini-3.8-flash');
  });

  it('prefers the Admin isDefault row over a caller-supplied fallback key', async () => {
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            cost: 1,
            isDefault: true,
            key: 'google/gemini-2.5-flash-lite',
            lifecycle: ModelLifecycle.RECOMMENDED,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();

    await expect(
      service.resolveModelKey(undefined, 'google/gemini-3.8-flash'),
    ).resolves.toBe('google/gemini-2.5-flash-lite');
  });

  it('warns that the registry is empty (seed the catalog) when there are no rows at all', async () => {
    const warn = vi.fn();
    const prisma = { model: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn } as unknown as LoggerService,
    );

    await service.getDefaultModelKey('google/gemini-3.8-flash');

    expect(warn).toHaveBeenCalledWith(
      'Agent chat model registry is empty; using seed default key',
      expect.objectContaining({ fallback: 'google/gemini-3.8-flash' }),
    );
  });

  it('warns that no active, non-Retired row exists when every seeded row is Retired', async () => {
    const warn = vi.fn();
    const prisma = {
      model: {
        findMany: vi.fn().mockResolvedValue([
          row({
            isActive: true,
            key: 'anthropic/claude-legacy',
            lifecycle: ModelLifecycle.RETIRED,
          }),
        ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn } as unknown as LoggerService,
    );
    await service.refresh();

    await service.getDefaultModelKey('google/gemini-3.8-flash');

    expect(warn).toHaveBeenCalledWith(
      'No active, non-Retired agent-chat model in registry; using seed default key',
      expect.objectContaining({ fallback: 'google/gemini-3.8-flash' }),
    );
  });
});

describe('AgentChatModelRegistryService.resolveOverrideModelKey', () => {
  const buildService = (rows: ReturnType<typeof row>[]) => {
    const prisma = {
      model: { findMany: vi.fn().mockResolvedValue(rows) },
    };
    return new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
  };

  it('resolves a known override key normally, taking precedence over the platform default', async () => {
    const service = buildService([
      row({
        isDefault: true,
        key: 'platform-default',
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
      row({ key: 'override-target', lifecycle: ModelLifecycle.RECOMMENDED }),
    ]);

    await expect(
      service.resolveOverrideModelKey('override-target'),
    ).resolves.toBe('override-target');
  });

  it('throws for a Retired override key instead of falling back or following another model', async () => {
    const service = buildService([
      row({
        isDefault: true,
        key: 'platform-default',
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
      row({
        key: 'legacy',
        label: 'Old Model',
        lifecycle: ModelLifecycle.RETIRED,
      }),
      row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
    ]);

    await expect(service.resolveOverrideModelKey('legacy')).rejects.toThrow(
      'The model Old Model was retired. Pick a new model, then run it again.',
    );
  });

  it('falls back to the platform default and warns when an override resolves to an inactive model', async () => {
    const warn = vi.fn();
    const service = new AgentChatModelRegistryService(
      {
        model: {
          findMany: vi.fn().mockResolvedValue([
            row({
              isActive: false,
              key: 'disabled-model',
              lifecycle: ModelLifecycle.AVAILABLE,
            }),
            row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          ]),
        },
      } as unknown as PrismaService,
      { warn } as unknown as LoggerService,
    );

    await expect(
      service.resolveOverrideModelKey('disabled-model'),
    ).resolves.toBe('recommended');
    expect(warn).toHaveBeenCalledWith(
      'Agent policy model override does not resolve to a known catalog model; falling back to the platform default',
      expect.objectContaining({ overrideKey: 'disabled-model' }),
    );
  });

  it('falls back to the platform default and warns on an override the registry does not know', async () => {
    const warn = vi.fn();
    const prisma = {
      model: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            row({ key: 'recommended', lifecycle: ModelLifecycle.RECOMMENDED }),
          ]),
      },
    };
    const service = new AgentChatModelRegistryService(
      prisma as unknown as PrismaService,
      { warn } as unknown as LoggerService,
    );

    await expect(
      service.resolveOverrideModelKey('stale-cuid-no-longer-in-catalog'),
    ).resolves.toBe('recommended');
    expect(warn).toHaveBeenCalledWith(
      'Agent policy model override does not resolve to a known catalog model; falling back to the platform default',
      expect.objectContaining({
        overrideKey: 'stale-cuid-no-longer-in-catalog',
      }),
    );
  });

  it('returns the platform default for an empty or missing override, without warning', async () => {
    const warn = vi.fn();
    const service = new AgentChatModelRegistryService(
      {
        model: {
          findMany: vi.fn().mockResolvedValue([
            row({
              key: 'recommended',
              lifecycle: ModelLifecycle.RECOMMENDED,
            }),
          ]),
        },
      } as unknown as PrismaService,
      { warn } as unknown as LoggerService,
    );

    await expect(service.resolveOverrideModelKey(null)).resolves.toBe(
      'recommended',
    );
    await expect(service.resolveOverrideModelKey(undefined)).resolves.toBe(
      'recommended',
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('AgentChatModelRegistryService round pricing', () => {
  const catalogRows = () =>
    AGENT_CHAT_MODELS.map((model) =>
      row({
        cost: model.creditCostPerRound,
        isDefault: model.key === AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH,
        isFree: model.isFree ?? false,
        key: model.key,
        label: model.label,
        lifecycle: ModelLifecycle.RECOMMENDED,
      }),
    );

  const createService = async (rows = catalogRows()) => {
    const service = new AgentChatModelRegistryService(
      {
        model: { findMany: vi.fn().mockResolvedValue(rows) },
      } as unknown as PrismaService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
    await service.refresh();
    return service;
  };

  const catalogCredits = (key: string) =>
    AGENT_CHAT_MODELS.find((model) => model.key === key)?.creditCostPerRound;

  it('bills an unknown model at the highest price, never the default row', async () => {
    const service = await createService();
    const highest = Math.max(
      AGENT_FALLBACK_ROUND_CREDITS,
      ...AGENT_CHAT_MODELS.map((model) => model.creditCostPerRound),
    );

    await expect(service.getRoundCredits('vendor/brand-new')).resolves.toBe(
      highest,
    );
    await expect(
      service.getRoundCredits('vendor/brand-new'),
    ).resolves.toBeGreaterThan(
      catalogCredits(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH) ?? 0,
    );
  });

  it('never bills an unknown model below a curated registry row priced above the contract', async () => {
    const service = await createService([
      ...catalogRows(),
      row({ cost: 500, key: 'vendor/frontier', label: 'Frontier' }),
      row({
        cost: 9_999,
        isDiscovered: true,
        key: 'vendor/unreviewed',
        reviewStatus: 'pending',
      }),
    ]);

    await expect(service.getRoundCredits('vendor/brand-new')).resolves.toBe(
      500,
    );
  });

  const usage = { completionTokens: 2_000, promptTokens: 10_000 };
  const catalogCostUsd = (key: string) => {
    const pricing = AGENT_CHAT_MODELS.find(
      (model) => model.key === key,
    )?.pricing;
    if (!pricing) {
      throw new Error(`${key} is not catalogued`);
    }
    return calculateAgentProviderCostUsd(pricing, usage);
  };

  it('prices a bare native Anthropic response model at the Sonnet 5 / Opus 5 token price', async () => {
    const service = await createService();

    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5_5,
        responseModel: 'claude-sonnet-5',
      }),
    ).resolves.toBeCloseTo(
      catalogCostUsd(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5_5),
      12,
    );
    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5,
        responseModel: 'claude-opus-5',
      }),
    ).resolves.toBeCloseTo(
      catalogCostUsd(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5),
      12,
    );
  });

  it('prices at the answering model when the router picked a different catalogued model', async () => {
    const service = await createService();

    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: AGENT_CHAT_MODEL_KEYS.GPT_6_1_TERRA,
        responseModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5,
      }),
    ).resolves.toBeCloseTo(
      catalogCostUsd(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5),
      12,
    );
  });

  it('falls back to the requested model price when the response model is unmapped', async () => {
    const service = await createService();

    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5,
        responseModel: 'anthropic/claude-opus-5-20260901',
      }),
    ).resolves.toBeCloseTo(
      catalogCostUsd(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5),
      12,
    );
  });

  it('prefers the registry row token price over the contract catalogue', async () => {
    const service = await createService(
      catalogRows().map((entry) =>
        entry.key === AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5_5
          ? {
              ...entry,
              inputCostPerMillionTokens: 4,
              outputCostPerMillionTokens: 20,
            }
          : entry,
      ),
    );

    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5_5,
      }),
    ).resolves.toBeCloseTo(0.04 + 0.04, 12);
  });

  it('prices an unknown model at the highest curated prompt and completion rates', async () => {
    const service = await createService();
    const highest = {
      completionPerMillion: Math.max(
        ...AGENT_CHAT_MODELS.map((model) => model.pricing.completionPerMillion),
      ),
      promptPerMillion: Math.max(
        ...AGENT_CHAT_MODELS.map((model) => model.pricing.promptPerMillion),
      ),
    };

    await expect(
      service.calculateRoundProviderCostUsd({
        ...usage,
        requestedModel: 'vendor/brand-new',
        responseModel: 'vendor/brand-new',
      }),
    ).resolves.toBeCloseTo(calculateAgentProviderCostUsd(highest, usage), 12);
  });

  it('converts provider USD to exact fractional credits at the live margin', async () => {
    const service = await createService();

    expect(service.toRoundCredits(0.001)).toBe(
      calculateAgentExactCredits(0.001),
    );
    expect(service.toRoundCredits(0)).toBe(0);
  });

  it('estimates fractional credits per average message for pickers', async () => {
    const service = await createService();
    const estimates = await service.getMessageCostEstimatesMap();

    expect(
      estimates[AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH],
    ).toBeGreaterThan(0);
    expect(estimates[AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH]).toBeLessThan(
      1,
    );
    expect(estimates[AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5_5]).toBeGreaterThan(
      estimates[AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH],
    );
    expect(estimates[AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE]).toBe(0);
  });
});
