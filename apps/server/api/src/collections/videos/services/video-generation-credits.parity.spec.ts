import { VideoGenerationCreditsService } from '@api/collections/videos/services/video-generation-credits.service';
import {
  type GenerationCreditParityCase,
  VIDEO_CREDIT_PARITY_CASES,
} from '@api/helpers/utils/credits/generation-credit-parity.fixture';
import { resolveAgentGenerationDimensions } from '@genfeedai/contracts/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4813 Charge side of the video parity matrix. The DTO mirrors what the
 * Agent tool builds from the quoted request: aspect ratio → execution
 * dimensions, duration (pilot or full), resolution and outputs unchanged.
 */
describe('VideoGenerationCreditsService parity with the Agent quote', () => {
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
    getOrganizationCreditsBalance: vi.fn(),
    reserveCredits: vi.fn(),
  };
  const modelsService = { findOne: vi.fn() };
  const byokService = {
    isByokActiveForProvider: vi.fn().mockResolvedValue(false),
  };
  const service = new VideoGenerationCreditsService(
    creditsUtilsService as never,
    modelsService as never,
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

  it.each(VIDEO_CREDIT_PARITY_CASES)(
    'charges $expectedCredits credits — $name',
    async (parityCase) => {
      modelsService.findOne.mockResolvedValue(modelRow(parityCase));
      const request = { creditsConfig: { deferred: true } };

      await service.ensureDeferredCredits(
        {
          ...resolveAgentGenerationDimensions(parityCase.aspectRatio),
          duration: parityCase.duration,
          outputs: parityCase.outputs,
          resolution: parityCase.resolution,
        },
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
