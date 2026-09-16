import { ImageGenerationCreditsService } from '@api/collections/images/services/image-generation-credits.service';
import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
import {
  type GenerationCreditParityCase,
  IMAGE_CREDIT_PARITY_CASES,
} from '@api/helpers/utils/credits/generation-credit-parity.fixture';
import { resolveAgentGenerationDimensions } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4813 Charge side of the image parity matrix. The DTO mirrors what the
 * Agent tool builds from the quoted request: the aspect ratio resolves to the
 * same execution dimensions, outputs and quality pass through unchanged.
 */
describe('ImageGenerationCreditsService parity with the Agent quote', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const modelsService = { findOne: vi.fn() };
  const providerRegistry = {
    providerFor: vi.fn((model: string, provider?: string) =>
      resolveImageGenerationProvider(model, provider),
    ),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn().mockResolvedValue(false),
    isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
  };
  const service = new ImageGenerationCreditsService(
    creditsUtilsService as never,
    modelsService as never,
    providerRegistry as never,
    byokService as never,
  );

  function modelRow(parityCase: GenerationCreditParityCase) {
    return {
      cost: parityCase.model.cost,
      costPerUnit: parityCase.model.costPerUnit ?? null,
      key: parityCase.model.key,
      minCost: parityCase.model.minCost ?? null,
      pricingType: parityCase.model.pricingType ?? null,
      provider: parityCase.model.provider,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(IMAGE_CREDIT_PARITY_CASES)(
    'charges $expectedCredits credits — $name',
    async (parityCase) => {
      modelsService.findOne.mockResolvedValue(modelRow(parityCase));
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        {
          ...resolveAgentGenerationDimensions(parityCase.aspectRatio),
          outputs: parityCase.outputs,
          quality: parityCase.quality,
        } as never,
        parityCase.model.key,
        'org-1',
        request as never,
      );

      expect(request.creditsConfig).toMatchObject({
        amount: parityCase.expectedCredits,
        deferred: false,
        modelKey: parityCase.model.key,
      });
      expect(creditsUtilsService.reserveCredits).not.toHaveBeenCalled();
    },
  );
});
