import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { EstimateGenerationCreditsDto } from '@api/services/router/dto/estimate-generation-credits.dto';
import { ModelCategory } from '@genfeedai/contracts';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentGenerationEstimateService', () => {
  const selectModel = vi.fn();
  const validateModelForOrg = vi.fn();
  const service = new AgentGenerationEstimateService(
    { selectModel } as never,
    { validateModelForOrg } as never,
    { warn: vi.fn() } as never,
  );
  const input = {
    category: ModelCategory.IMAGE as const,
    organizationId: 'org-1',
    prompt: 'A red car',
  };
  const model = {
    key: 'openai/gpt-image-2',
    category: ModelCategory.IMAGE,
    cost: 50,
    isActive: true,
    isDeleted: false,
    organizationId: null,
  };
  const unavailable = { credits: null, isAvailable: false, modelKey: null };
  beforeEach(() => {
    vi.clearAllMocks();
    selectModel.mockResolvedValue({
      modelDetails: { key: model.key, cost: 999 },
    });
    validateModelForOrg.mockResolvedValue(model);
  });
  it('prices Auto and explicit model from the same validated organization row', async () => {
    const auto = await service.estimate({
      ...input,
      outputs: 2,
      quality: 'low',
    });
    const explicit = await service.estimate({
      ...input,
      modelKey: model.key,
      outputs: 2,
      quality: 'low',
    });
    expect(auto).toEqual({
      credits: 12,
      isAvailable: true,
      modelKey: model.key,
    });
    expect(explicit).toEqual(auto);
    expect(selectModel).toHaveBeenCalledTimes(1);
    expect(validateModelForOrg).toHaveBeenCalledWith(model.key, 'org-1');
  });
  it('applies video pricing multipliers', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      category: ModelCategory.VIDEO,
      costPerUnit: 10,
      minCost: 50,
      pricingType: 'per-second',
    });
    expect(
      await service.estimate({
        ...input,
        category: ModelCategory.VIDEO,
        duration: 8,
      }),
    ).toMatchObject({ credits: 80, isAvailable: true });
  });
  it('preserves the pricing helper minimum when base cost is zero', async () => {
    validateModelForOrg.mockResolvedValue({ ...model, cost: 0 });
    expect(await service.estimate(input)).toMatchObject({
      credits: 1,
      isAvailable: true,
    });
  });
  it.each([
    { key: 'retired-successor' },
    { category: ModelCategory.VIDEO },
    { isActive: false },
    { isDeleted: true },
    { organizationId: 'foreign' },
    { cost: undefined },
    { cost: null },
    { cost: Number.NaN },
    { cost: Infinity },
    { cost: -1 },
  ])(
    'rejects unavailable model row %j without exposing a key',
    async (override) => {
      validateModelForOrg.mockResolvedValue({ ...model, ...override });
      expect(await service.estimate(input)).toEqual(unavailable);
    },
  );
  it('hides model identity when organization policy rejects it', async () => {
    validateModelForOrg.mockRejectedValue(new Error('not enabled'));
    expect(await service.estimate(input)).toEqual(unavailable);
  });
  it.each([0, 9, 1.5, Number.NaN, Infinity])(
    'rejects invalid output count %s at service and DTO boundaries',
    async (outputs) => {
      await expect(service.estimate({ ...input, outputs })).rejects.toThrow(
        'Outputs must be an integer',
      );
      const dto = Object.assign(new EstimateGenerationCreditsDto(), {
        prompt: 'Car',
        category: 'image',
        outputs,
      });
      expect(
        (await validate(dto)).some((error) => error.property === 'outputs'),
      ).toBe(true);
      expect(selectModel).not.toHaveBeenCalled();
    },
  );
});
