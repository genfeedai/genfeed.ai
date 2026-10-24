import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { McpApprovalPricingService } from '@api/collections/mcp-approvals/services/mcp-approval-pricing.service';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { ReplicatePromptBuilder } from '@api/services/prompt-builder/builders/replicate-prompt.builder';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  AgentGenerationQuoteUnavailableReason,
  type AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import type { StudioGenerationCostEstimate } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import {
  mapReplicateBillingTiers,
  REVIEWED_RATE_SHEET_ENTRIES,
  setRuntimeMarginMultiplier,
} from '@genfeedai/pricing';
import { REPLICATE_VARIANT_FIXTURES } from '@genfeedai/pricing/reviewed-rates/replicate-variants.fixture';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real prompt builders, the reviewed rate sheet and the real quote adapter; no
// generation provider is contacted. These are the MCP quote paths from #8010.
describe('generation quote settings (#8010)', () => {
  const logger = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const builder = new PromptBuilderService(
    logger as never,
    {} as never,
    new ReplicatePromptBuilder({ get: vi.fn(), isDevelopment: false } as never),
    {} as never,
  );
  let row: Record<string, unknown>;
  const models = { findOne: vi.fn(async () => row) };
  const quote = testModelCreditQuote(models as never);
  const estimate = new AgentGenerationEstimateService(
    {} as never,
    { validateModelForOrg: vi.fn(async () => row) } as never,
    logger as never,
    quote,
    builder,
  );
  const admission = new ImageGenerationCreditsService(
    {
      checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    } as never,
    models as never,
    { providerFor: () => 'replicate', supports: () => true } as never,
    { resolveApiKey: vi.fn().mockResolvedValue(undefined) } as never,
    quote,
    builder,
  );
  const cost = new AgentGenerationCostToolHandler(
    { getOrganizationCreditsBalance: vi.fn(async () => 500) } as never,
    estimate,
  );
  const pricing = new McpApprovalPricingService(estimate);
  const ctx = {
    brandId: 'brand-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as ToolExecutionContext;

  function estimateOf(result: AgentToolResult): StudioGenerationCostEstimate {
    return result.data?.estimate as StudioGenerationCostEstimate;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setRuntimeMarginMultiplier(1);
  });

  /** A registry row priced by the shipped rate sheet entry for `endpoint`. */
  function sheetRow(
    endpoint: string,
    providerInputSchema?: Record<string, unknown>,
  ) {
    const entry = REVIEWED_RATE_SHEET_ENTRIES.find(
      (candidate) =>
        candidate.provider === 'replicate' && candidate.endpoint === endpoint,
    );
    if (!entry) throw new Error(`No reviewed rate sheet entry ${endpoint}`);
    return {
      category: ModelCategory.IMAGE,
      isActive: true,
      isDeleted: false,
      key: endpoint,
      organizationId: null,
      provider: 'replicate',
      providerInputSchema,
      rateVersion: 'sheet-v1',
      requiredSelectorKeys: ['resolution'],
      requiresReviewedRates: true,
      reviewedPricing: {
        currency: 'USD',
        rates: entry.rates,
        reviewStatus: 'approved',
        sourceUrl: entry.sourceUrl,
        verifiedAt: '2026-10-05T00:00:00Z',
        version: 'sheet-v1',
      },
    };
  }

  function gptImage2Row() {
    return capturedRow(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2);
  }

  /** A registry row priced by the captured Replicate billing tiers. */
  function capturedRow(modelKey: string, category = ModelCategory.IMAGE) {
    const fixture = REPLICATE_VARIANT_FIXTURES[modelKey];
    if (!fixture) throw new Error(`Missing fixture ${modelKey}`);
    const mapping = mapReplicateBillingTiers(
      fixture.tiers,
      fixture.inputProperties,
      modelKey,
    );
    if (mapping.status !== 'ok') throw new Error(mapping.reason);
    return {
      category,
      isActive: true,
      isDeleted: false,
      key: modelKey,
      organizationId: null,
      provider: 'replicate',
      providerInputSchema: { properties: fixture.inputProperties },
      rateVersion: 'captured-v1',
      requiredSelectorKeys: mapping.selectorKeys,
      requiresReviewedRates: true,
      reviewedPricing: {
        currency: 'USD',
        rates: mapping.rates,
        reviewStatus: 'approved',
        sourceUrl: fixture.sourceUrl,
        variantRules: mapping.variantRules,
        verifiedAt: '2026-10-05T00:00:00Z',
        version: 'captured-v1',
      },
    };
  }

  function image(modelKey: string, resolution?: string, outputs = 1) {
    return estimate.estimate({
      category: 'image',
      modelKey,
      organizationId: 'org-1',
      outputs,
      ...(resolution ? { resolution } : {}),
    });
  }

  describe('Nano Banana resolution tiers', () => {
    const NANO_BANANA_2 = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2;
    const NANO_BANANA_PRO = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO;

    it('quotes Nano Banana 2 at its default 1K tier when no resolution is chosen', async () => {
      row = sheetRow(NANO_BANANA_2);
      const chosen = await image(NANO_BANANA_2, '1K');
      expect(chosen).toMatchObject({ isAvailable: true });
      expect(await image(NANO_BANANA_2)).toEqual(chosen);
    });

    it('treats a lower-case tier as the same tier and prices the larger ones higher', async () => {
      row = sheetRow(NANO_BANANA_2);
      const oneK = await image(NANO_BANANA_2, '1K');
      expect(await image(NANO_BANANA_2, '1k')).toEqual(oneK);
      const twoK = await image(NANO_BANANA_2, '2K');
      expect(twoK.credits).toBeGreaterThan(oneK.credits ?? Infinity);
    });

    it('quotes Nano Banana Pro at its 2K default', async () => {
      row = sheetRow(NANO_BANANA_PRO);
      expect(await image(NANO_BANANA_PRO)).toEqual(
        await image(NANO_BANANA_PRO, '2K'),
      );
    });

    it('prefers the default in the model schema over the built-in one', async () => {
      row = sheetRow(NANO_BANANA_2, {
        properties: { resolution: { default: '2K', enum: ['1K', '2K', '4K'] } },
        type: 'object',
      });
      expect(await image(NANO_BANANA_2)).toEqual(
        await image(NANO_BANANA_2, '2K'),
      );
    });

    it('charges at admission exactly what the estimate quoted', async () => {
      row = sheetRow(NANO_BANANA_2);
      const quoted = await image(NANO_BANANA_2);
      const admitted = await admission.quoteCredits(
        { height: 1024, outputs: 1, width: 1024 } as never,
        NANO_BANANA_2,
        'org-1',
      );
      expect(admitted.unitCredits).toBe(quoted.credits);
    });

    it('get_generation_options quotes a chosen tier, not the default', async () => {
      row = sheetRow(NANO_BANANA_2);
      const quoteFor = async (resolution?: string) =>
        estimateOf(
          await cost.execute(
            {
              modelKey: NANO_BANANA_2,
              type: 'image',
              ...(resolution ? { resolution } : {}),
            },
            ctx,
          ),
        );
      const base = await quoteFor();
      expect(base).toMatchObject({ status: 'estimated' });
      const twoK = await quoteFor('2K');
      expect(twoK).toMatchObject({ status: 'estimated' });
      expect(twoK.credits).toBe((await image(NANO_BANANA_2, '2K')).credits);
      expect(twoK.credits).toBeGreaterThan(base.credits ?? Infinity);
    });
  });

  describe('Ideogram Character', () => {
    const CHARACTER = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER;

    it('quotes the default rendering speed without a reference image', async () => {
      row = capturedRow(CHARACTER);
      const quoted = await image(CHARACTER);
      expect(quoted).toMatchObject({ isAvailable: true });
      expect(quoted.credits).toBeGreaterThan(0);
    });
  });

  describe('video models that need a source image', () => {
    it.each([
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
      MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
    ])('quotes %s by duration and resolution without a source', async (key) => {
      row = capturedRow(key, ModelCategory.VIDEO);
      const quoted = await estimate.estimate({
        category: 'video',
        duration: 5,
        modelKey: key,
        organizationId: 'org-1',
      });
      expect(quoted).toMatchObject({ isAvailable: true });
      expect(quoted.credits).toBeGreaterThan(0);
    });
  });

  describe('FLUX.3', () => {
    const FLUX_3 = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;

    it('quotes the default request in the model lower-case tier', async () => {
      row = sheetRow(FLUX_3);
      const result = await cost.execute(
        { modelKey: FLUX_3, type: 'image' },
        ctx,
      );
      expect(estimateOf(result)).toMatchObject({ status: 'estimated' });
      expect(estimateOf(result).credits).toBe(
        (await image(FLUX_3, '1k')).credits,
      );
    });

    it('names the output count when more than one image is requested', async () => {
      row = sheetRow(FLUX_3);
      expect(await image(FLUX_3, '1k', 2)).toMatchObject({
        isAvailable: false,
        unavailableDetail: expect.stringContaining('outputs to 1'),
        unavailableReason:
          AgentGenerationQuoteUnavailableReason.MISSING_SETTING,
      });
      const result = await cost.execute(
        { modelKey: FLUX_3, outputs: 2, resolution: '1k', type: 'image' },
        ctx,
      );
      expect(estimateOf(result)).toMatchObject({
        status: 'unavailable',
        unavailableDetail: expect.stringContaining('outputs to 1'),
      });
    });

    it('names the valid tiers when the resolution is not one of them', async () => {
      row = sheetRow(FLUX_3);
      expect(await image(FLUX_3, '1K')).toMatchObject({
        isAvailable: false,
        unavailableDetail: expect.stringContaining('768sq, 1k, 1.5k, 2k, 4k'),
      });
    });
  });

  describe('MCP approval quote with a character reference', () => {
    const GPT_IMAGE_2 = MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2;
    const args = {
      aspectRatio: '16:9',
      model: GPT_IMAGE_2,
      outputs: 2,
      type: 'image',
    };

    it('quotes the same figure with and without the character', async () => {
      row = gptImage2Row();
      const plain = await pricing.quote('generate', args, ctx);
      expect(plain).toMatchObject({ isAvailable: true });
      const withCharacter = await pricing.quote(
        'generate',
        { ...args, characterHandles: ['vincent'] },
        ctx,
      );
      expect(withCharacter).toMatchObject({ isAvailable: true });
      expect(withCharacter?.credits).toBe(plain?.credits);
      expect(withCharacter?.snapshot?.modelKey).toBe(GPT_IMAGE_2);
    });

    it('prepares consent for a character image request', async () => {
      row = gptImage2Row();
      await expect(
        pricing.prepare(
          'generate',
          { ...args, characterHandles: ['vincent'], resolution: '1k' },
          ctx,
        ),
      ).resolves.toMatchObject({ billingMode: 'credits', version: 1 });
    });

    it('tells the caller to pass a model or a prompt when neither was given', async () => {
      row = gptImage2Row();
      await expect(
        pricing.prepare('generate', { type: 'image' }, ctx),
      ).rejects.toThrow(/no prompt to route from/);
    });

    it('explains that video with reference media cannot be quoted', async () => {
      row = gptImage2Row();
      await expect(
        pricing.prepare(
          'generate',
          {
            imageUrl: 'https://cdn.example.com/a.jpg',
            model: 'm',
            type: 'video',
          },
          ctx,
        ),
      ).rejects.toThrow(/Video with reference media/);
    });
  });
});
