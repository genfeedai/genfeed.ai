import { readFileSync } from 'node:fs';
import {
  GENERATION_CREDIT_PARITY_CASES,
  type GenerationCreditParityCase,
} from '@api/helpers/utils/credits/generation-credit-parity.fixture';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import type { FalJsonSchema } from '@api/services/integrations/fal/services/fal-contract';
import { FalSchemaFamily } from '@api/services/integrations/fal/services/fal-contract';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import { setRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4813 Quote side of the parity matrix. The charge side lives beside the
 * image/video credits services; both assert the same `expectedCredits`.
 */
describe('AgentGenerationEstimateService parity with charging', () => {
  const selectModel = vi.fn();
  const validateModelForOrg = vi.fn();
  const buildPrompt = vi.fn();
  const service = new AgentGenerationEstimateService(
    { selectModel } as never,
    { validateModelForOrg } as never,
    { warn: vi.fn() } as never,
    testModelCreditQuote({
      findOne: async () => validateModelForOrg(),
    } as never),
    { buildPrompt } as never,
  );

  function modelRow(parityCase: GenerationCreditParityCase) {
    return {
      category: parityCase.category,
      cost: parityCase.model.cost,
      isFree: parityCase.model.isFree,
      reviewedPricing: parityCase.model.reviewedPricing,
      rateVersion: parityCase.model.rateVersion,
      costPerUnit: parityCase.model.costPerUnit ?? null,
      isActive: true,
      isDeleted: false,
      key: parityCase.model.key,
      minCost: parityCase.model.minCost ?? null,
      organizationId: null,
      pricingType: parityCase.model.pricingType ?? null,
      provider: parityCase.model.provider,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    buildPrompt.mockReset();
    setRuntimeMarginMultiplier(1);
  });

  it.each(GENERATION_CREDIT_PARITY_CASES)(
    'quotes $expectedCredits credits — $name',
    async (parityCase) => {
      validateModelForOrg.mockResolvedValue(modelRow(parityCase));

      const quote = await service.estimate({
        aspectRatio: parityCase.aspectRatio,
        category: parityCase.category,
        duration: parityCase.duration,
        modelKey: parityCase.model.key,
        organizationId: 'org-1',
        outputs: parityCase.outputs,
        prompt: 'Parity fixture',
        quality: parityCase.quality,
        resolution: parityCase.resolution,
      });

      expect(quote).toEqual({
        credits: parityCase.expectedCredits,
        isAvailable: true,
        modelKey: parityCase.model.key,
      });
      expect(selectModel).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['bytedance/seedance-2.0/text-to-video', 0.000014, 152],
    ['fal-ai/bytedance/seedance/v1.5/pro/text-to-video', 0.0000024, 26],
  ] as const)(
    'uses the reviewed %s defaults and prepared output size in the estimate',
    async (endpoint, unitPriceUsd, expectedCredits) => {
      const fixtures = JSON.parse(
        readFileSync(
          new URL(
            '../../../../workers/test/fixtures/fal/seedance-contracts.json',
            import.meta.url,
          ),
          'utf8',
        ),
      ) as Array<{
        endpoint: string;
        contract: { inputSchema: FalJsonSchema };
      }>;
      const schema = fixtures.find((row) => row.endpoint === endpoint)?.contract
        .inputSchema;
      if (!schema) throw new Error('Missing captured provider schema');
      const key = `fal/${endpoint}`;
      const rates = [
        {
          component: 'output',
          unit: 'video-token',
          unitPriceUsd,
          when: { resolution: '720p' },
          isPerOutput: true,
        },
      ];
      validateModelForOrg.mockResolvedValue({
        category: 'video',
        key,
        endpoint,
        provider: 'fal',
        providerInputSchema: schema,
        providerSchemaFamily: FalSchemaFamily.VIDEO_TEXT,
        isActive: true,
        isDeleted: false,
        isFree: false,
        organizationId: null,
        pricingType: 'conditional',
        providerCostUsd: null,
        cost: 0,
        requiredSelectorKeys: ['resolution'],
        rateVersion: 'captured-native-v1',
        reviewedPricing: {
          version: 'captured-native-v1',
          currency: 'USD',
          sourceUrl: `https://fal.ai/models/${endpoint}`,
          verifiedAt: '2026-10-09T22:07:02.989Z',
          reviewStatus: 'approved',
          invariantSelectors: ['generate_audio'],
          rates,
        },
      });
      buildPrompt.mockResolvedValue({ input: { aspect_ratio: '16:9' } });
      expect(
        await service.estimate({
          category: 'video',
          modelKey: key,
          organizationId: 'org-1',
          prompt: 'A slow pan',
          dimensions: { width: 1920, height: 1080 },
          duration: 5,
        }),
      ).toEqual({ credits: expectedCredits, isAvailable: true, modelKey: key });
      buildPrompt.mockResolvedValue({ input: { aspect_ratio: 'auto' } });
      expect(
        await service.estimate({
          category: 'video',
          modelKey: key,
          organizationId: 'org-1',
          prompt: 'A slow pan',
          dimensions: { width: 1920, height: 1080 },
          duration: 5,
        }),
      ).toMatchObject({ credits: null, isAvailable: false });
      buildPrompt.mockResolvedValue({ input: { aspect_ratio: 'unreviewed' } });
      expect(
        await service.estimate({
          category: 'video',
          modelKey: key,
          organizationId: 'org-1',
          prompt: 'A slow pan',
          dimensions: { width: 1920, height: 1080 },
          duration: 5,
        }),
      ).toMatchObject({
        credits: null,
        isAvailable: false,
        unavailableReason:
          AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED,
      });
    },
  );
});
