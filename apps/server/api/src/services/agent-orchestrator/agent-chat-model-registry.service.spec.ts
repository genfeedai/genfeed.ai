import { AgentChatModelRegistryService } from '@api/services/agent-orchestrator/agent-chat-model-registry.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle, ModelProvider } from '@genfeedai/contracts';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
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
  succeededBy: null,
  supportsFeatures: [],
  ...overrides,
});

describe('AgentChatModelRegistryService', () => {
  it('keeps Legacy explicit, hides Retired, and follows Retired successors', async () => {
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
            lifecycle: ModelLifecycle.RETIRED,
            succeededBy: 'recommended',
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
    await expect(service.resolveModelKey('retired')).resolves.toBe(
      'recommended',
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
});

describe('AgentChatModelRegistryService round pricing', () => {
  const catalogRows = () =>
    AGENT_CHAT_MODELS.map((model) =>
      row({
        cost: model.creditCostPerRound,
        isDefault: model.key === AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH,
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
      catalogCredits(AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_FLASH) ?? 0,
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

  it('settles a bare native Anthropic response model at the Sonnet 5 / Opus 5 price', async () => {
    const service = await createService();

    await expect(
      service.getSettledRoundCredits({
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
        responseModel: 'claude-sonnet-5',
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5));
    await expect(
      service.getSettledRoundCredits({
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
        responseModel: 'claude-opus-5',
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5));
  });

  it('settles at the answering model price when the router picked a different catalogued model', async () => {
    const service = await createService();

    await expect(
      service.getSettledRoundCredits({
        requestedModel: AGENT_CHAT_MODEL_KEYS.GPT_5_6_TERRA,
        responseModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5));
  });

  it('falls back to the requested model price when the response model is unmapped', async () => {
    const service = await createService();

    await expect(
      service.getSettledRoundCredits({
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5,
        responseModel: 'anthropic/claude-opus-5-20260901',
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.CLAUDE_OPUS_5));
    await expect(
      service.getSettledRoundCredits({
        requestedModel: AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5,
      }),
    ).resolves.toBe(catalogCredits(AGENT_CHAT_MODEL_KEYS.CLAUDE_SONNET_5));
  });
});
