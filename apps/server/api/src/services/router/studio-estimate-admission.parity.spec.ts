import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { normalizeProviderVideoDuration } from '@api/services/prompt-builder/builders/replicate/provider-video-duration.util';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  MODEL_KEYS,
  resolveStudioGenerationDimensions,
} from '@genfeedai/contracts/constants';
import {
  calculateImageGenerationCredits,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #6197 review: the Studio estimate and the options tool must show the credits
 * admission charges for the same settings, including audio, provider duration
 * normalization and the dimensions Studio submits.
 */
const ctx = { organizationId: 'org-1' } as ToolExecutionContext;

function reviewedAudioRates() {
  return {
    version: 'parity-v1',
    currency: 'USD',
    sourceUrl: 'https://example.test/fictional',
    verifiedAt: new Date().toISOString(),
    reviewStatus: 'approved',
    rates: [true, false].map((audio) => ({
      component: 'generation',
      unit: 'second',
      unitPriceUsd: audio ? 0.4 : 0.2,
      when: { audio },
      isPerOutput: true,
    })),
  };
}

describe('Studio estimate parity with admission', () => {
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const promptBuilder = new PromptBuilderService(
    logger as never,
    {} as never,
    new ReplicatePromptBuilder({
      get: vi.fn(),
      isDevelopment: false,
    } as never),
    {} as never,
  );
  let row: Record<string, unknown>;
  const models = { findOne: vi.fn(async () => row) };
  const modelCreditQuote = testModelCreditQuote(models as never);
  const estimateService = new AgentGenerationEstimateService(
    { selectModel: vi.fn() } as never,
    { validateModelForOrg: vi.fn(async () => row) } as never,
    logger as never,
    modelCreditQuote,
    promptBuilder,
  );
  const admission = new VideoGenerationCreditsService(
    {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
      getOrganizationCreditsBalance: vi.fn(),
      reserveCredits: vi.fn(),
    } as never,
    models as never,
    { resolveApiKey: vi.fn().mockResolvedValue(undefined) } as never,
    modelCreditQuote,
  );
  const baseRow = {
    isActive: true,
    isDeleted: false,
    organizationId: null,
    pricingType: 'flat',
  };

  /** What admission quotes: the Studio payload plus the provider-built input. */
  async function admissionCredits(
    dto: {
      duration: number;
      height: number;
      isAudioEnabled?: boolean;
      outputs: number;
      resolution?: string;
      width: number;
    },
    modelKey: string,
  ): Promise<number> {
    const built = await promptBuilder.buildPrompt(modelKey, {
      ...dto,
      brandingMode: 'off',
      modelCategory: ModelCategory.VIDEO,
      prompt: 'A real prompt',
      useTemplate: false,
    });
    const request = { creditsConfig: { deferred: true } };
    await admission.ensureDeferredCredits(
      dto,
      modelKey,
      'org-1',
      request as never,
      built.input as unknown as Record<string, unknown>,
    );
    return (request.creditsConfig as unknown as { amount: number }).amount;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(1);
  });

  function veoRow() {
    return {
      ...baseRow,
      category: ModelCategory.VIDEO,
      cost: 10,
      key: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
      provider: 'replicate',
      rateVersion: 'parity-v1',
      requiredSelectorKeys: ['audio'],
      reviewedPricing: reviewedAudioRates(),
    };
  }

  it.each([true, false])(
    'prices video audio=%s like admission (audio selector)',
    async (isAudioEnabled) => {
      const modelKey = MODEL_KEYS.REPLICATE_GOOGLE_VEO_3;
      row = veoRow();
      const { height, width } = resolveStudioGenerationDimensions(
        '16:9',
        '720p',
      );
      const charged = await admissionCredits(
        { duration: 8, height, isAudioEnabled, outputs: 1, width },
        modelKey,
      );
      const quote = await estimateService.estimate({
        aspectRatio: '16:9',
        category: 'video',
        duration: 8,
        height,
        isAudioEnabled,
        modelKey,
        organizationId: 'org-1',
        outputs: 1,
        width,
      });
      expect(quote.isAvailable).toBe(true);
      expect(quote.credits).toBe(charged);
    },
  );

  it('differs between audio on and off, so the toggle refreshes the estimate', async () => {
    row = veoRow();
    const quoteFor = async (isAudioEnabled: boolean) =>
      (
        await estimateService.estimate({
          category: 'video',
          duration: 8,
          isAudioEnabled,
          modelKey: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
          organizationId: 'org-1',
        })
      ).credits;
    expect(await quoteFor(true)).not.toBe(await quoteFor(false));
  });

  it('prices Hailuo 5 s as the 6 s the provider executes, like admission', async () => {
    const modelKey = MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3;
    row = {
      ...baseRow,
      category: ModelCategory.VIDEO,
      cost: 1,
      costPerUnit: 10,
      key: modelKey,
      pricingType: 'per-second',
      provider: 'replicate',
    };
    const { height, width } = resolveStudioGenerationDimensions('16:9', '720p');
    const charged = await admissionCredits(
      { duration: 5, height, outputs: 1, width },
      modelKey,
    );
    const quote = await estimateService.estimate({
      aspectRatio: '16:9',
      category: 'video',
      duration: 5,
      height,
      modelKey,
      organizationId: 'org-1',
      outputs: 1,
      width,
    });
    expect(charged).toBe(60);
    expect(quote.credits).toBe(charged);
  });

  it('prices Hailuo 2.3 Fast 5 s as 6 s without any reference in the estimate request', async () => {
    const modelKey = MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST;
    row = {
      ...baseRow,
      category: ModelCategory.VIDEO,
      cost: 1,
      costPerUnit: 10,
      key: modelKey,
      pricingType: 'per-second',
      provider: 'replicate',
    };
    // Admission quotes the provider input the builder produced for the request
    // (which carried its first frame); the estimate has none.
    const request = { creditsConfig: { deferred: true } };
    await admission.ensureDeferredCredits(
      { duration: 5, height: 720, outputs: 1, width: 1280 },
      modelKey,
      'org-1',
      request as never,
      { duration: normalizeProviderVideoDuration(modelKey, 5) },
    );
    const charged = (request.creditsConfig as unknown as { amount: number })
      .amount;
    const quote = await estimateService.estimate({
      category: 'video',
      duration: 5,
      modelKey,
      organizationId: 'org-1',
    });
    expect(charged).toBe(60);
    expect(quote).toMatchObject({ credits: charged, isAvailable: true });
    expect(normalizeProviderVideoDuration(modelKey, 5)).toBe(6);
  });

  it('prices 1:1 at 2K as 2048x2048 megapixels for Studio and the options tool alike', async () => {
    const modelKey = 'fal-ai/flux/dev';
    row = {
      ...baseRow,
      category: ModelCategory.IMAGE,
      cost: 1,
      costPerUnit: 4,
      key: modelKey,
      pricingType: 'per-megapixel',
      provider: 'fal',
    };
    const { height, width } = resolveStudioGenerationDimensions('1:1', '2K');
    expect({ height, width }).toEqual({ height: 2048, width: 2048 });
    const charged = calculateImageGenerationCredits({
      height,
      imageProvider: 'fal',
      isBatchSupported: false,
      modelKey,
      outputs: 1,
      pricing: row as never,
      width,
    }).credits;

    const studio = await estimateService.estimate({
      aspectRatio: '1:1',
      category: 'image',
      height,
      modelKey,
      organizationId: 'org-1',
      outputs: 1,
      resolution: '2K',
      width,
    });
    const tool = await new AgentGenerationCostToolHandler(
      { getOrganizationCreditsBalance: vi.fn(async () => 1) } as never,
      estimateService,
    ).execute(
      { aspectRatio: '1:1', modelKey, resolution: '2K', type: 'image' },
      ctx,
    );

    expect(studio.credits).toBe(charged);
    expect(tool.data?.estimate).toEqual({
      credits: charged,
      status: 'estimated',
    });
  });
});
