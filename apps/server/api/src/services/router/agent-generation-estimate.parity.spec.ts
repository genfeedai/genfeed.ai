import {
  GENERATION_CREDIT_PARITY_CASES,
  type GenerationCreditParityCase,
} from '@api/helpers/utils/credits/generation-credit-parity.fixture';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #4813 Quote side of the parity matrix. The charge side lives beside the
 * image/video credits services; both assert the same `expectedCredits`.
 */
describe('AgentGenerationEstimateService parity with charging', () => {
  const selectModel = vi.fn();
  const validateModelForOrg = vi.fn();
  const service = new AgentGenerationEstimateService(
    { selectModel } as never,
    { validateModelForOrg } as never,
    { warn: vi.fn() } as never,
  );

  function modelRow(parityCase: GenerationCreditParityCase) {
    return {
      category: parityCase.category,
      cost: parityCase.model.cost,
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
});
