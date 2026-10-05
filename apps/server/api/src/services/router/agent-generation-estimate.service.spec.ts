import { resolveIdeaGenerationParams } from '@api/collections/batch-projects/services/batch-project-dispatch.util';
import { resolveImageGenerationProvider } from '@api/collections/images/services/image-generation-provider.util';
import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { EstimateGenerationCreditsDto } from '@api/services/router/dto/estimate-generation-credits.dto';
import { ModelCategory } from '@genfeedai/contracts';
import { AgentGenerationQuoteUnavailableReason } from '@genfeedai/contracts/interfaces';
import {
  calculateImageGenerationCredits,
  calculateVideoGenerationCredits,
} from '@genfeedai/pricing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AgentGenerationEstimateService', () => {
  const selectModel = vi.fn();
  const resolveModelKey = vi.fn();
  const logger = { error: vi.fn(), warn: vi.fn() };
  const validateModelForOrg = vi.fn();
  const service = new AgentGenerationEstimateService(
    { resolveModelKey, selectModel } as never,
    { validateModelForOrg } as never,
    logger as never,
    testModelCreditQuote({
      findOne: async () => validateModelForOrg(),
    } as never),
    { buildPrompt: vi.fn() } as never,
  );
  const input = {
    category: ModelCategory.IMAGE as const,
    organizationId: 'org-1',
    prompt: 'A red car',
  };
  const model = {
    key: 'openai/gpt-image-2',
    provider: 'replicate',
    category: ModelCategory.IMAGE,
    cost: 50,
    isActive: true,
    isDeleted: false,
    organizationId: null,
  };
  const unavailable = (
    unavailableReason: AgentGenerationQuoteUnavailableReason,
  ) => ({
    credits: null,
    isAvailable: false,
    modelKey: null,
    unavailableReason,
  });
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
    });
    const explicit = await service.estimate({
      ...input,
      modelKey: model.key,
      outputs: 2,
    });
    expect(auto).toEqual({
      credits: 100,
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
  it('quotes the executed dimensions for per-megapixel models by aspect ratio', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      cost: 1,
      costPerUnit: 4,
      key: 'fal-ai/flux/dev',
      provider: 'fal',
      pricingType: 'per-megapixel',
    });
    const portrait = await service.estimate({
      ...input,
      aspectRatio: '3:4',
      modelKey: 'fal-ai/flux/dev',
    });
    const square = await service.estimate({
      ...input,
      aspectRatio: '1:1',
      modelKey: 'fal-ai/flux/dev',
    });
    expect(portrait).toMatchObject({ credits: 6, isAvailable: true });
    expect(square).toMatchObject({ credits: 5, isAvailable: true });
    expect(
      await service.estimate({ ...input, modelKey: 'fal-ai/flux/dev' }),
    ).toEqual(square);
  });
  it('quotes explicit execution dimensions exactly as the generation charges them', async () => {
    const pricedModel = {
      ...model,
      cost: 1,
      costPerUnit: 4,
      key: 'fal-ai/flux/dev',
      pricingType: 'per-megapixel',
      provider: 'fal',
    };
    validateModelForOrg.mockResolvedValue(pricedModel);
    const idea = resolveIdeaGenerationParams('image');

    const quote = await service.estimate({
      ...input,
      aspectRatio: idea.aspectRatio,
      dimensions: { height: idea.height, width: idea.width },
      modelKey: pricedModel.key,
      outputs: 1,
    });

    // What ImageGenerationCreditsService charges for the dispatched request.
    const charged = calculateImageGenerationCredits({
      height: idea.height,
      imageProvider: resolveImageGenerationProvider(
        pricedModel.key,
        pricedModel.provider,
      ),
      isBatchSupported: false,
      modelKey: pricedModel.key,
      outputs: 1,
      pricing: pricedModel,
      width: idea.width,
    });
    expect(idea).toMatchObject({ height: 1920, width: 1080 });
    expect(quote).toEqual({
      credits: charged.credits,
      isAvailable: true,
      modelKey: pricedModel.key,
    });
    const agentTableQuote = await service.estimate({
      ...input,
      aspectRatio: idea.aspectRatio,
      modelKey: pricedModel.key,
      outputs: 1,
    });
    expect(agentTableQuote.credits).not.toBe(charged.credits);
  });

  it('quotes an explicit video size and duration exactly as the generation charges them', async () => {
    const pricedModel = {
      ...model,
      category: ModelCategory.VIDEO,
      cost: 1,
      costPerUnit: 10,
      key: 'fal-ai/video',
      provider: 'fal',
      pricingType: 'per-second',
    };
    validateModelForOrg.mockResolvedValue(pricedModel);
    const idea = resolveIdeaGenerationParams('video');

    const quote = await service.estimate({
      ...input,
      aspectRatio: idea.aspectRatio,
      category: ModelCategory.VIDEO,
      dimensions: { height: idea.height, width: idea.width },
      duration: idea.duration,
      modelKey: pricedModel.key,
      outputs: 1,
    });

    // What VideoGenerationCreditsService charges for the dispatched request.
    const charged = calculateVideoGenerationCredits({
      duration: idea.duration,
      height: idea.height,
      isBatchSupported: false,
      modelKey: pricedModel.key,
      outputs: 1,
      pricing: pricedModel,
      width: idea.width,
    });
    expect(quote.credits).toBe(charged.credits);
  });

  it('prices output units for native batches and Fal fan-out', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      cost: 6,
      key: 'bytedance/seedream-4.5',
    });
    expect(
      await service.estimate({
        ...input,
        modelKey: 'bytedance/seedream-4.5',
        outputs: 4,
      }),
    ).toMatchObject({ credits: 24, isAvailable: true });
    validateModelForOrg.mockResolvedValue({
      ...model,
      cost: 6,
      key: 'fal-ai/flux/dev',
      provider: 'fal',
    });
    expect(
      await service.estimate({
        ...input,
        modelKey: 'fal-ai/flux/dev',
        outputs: 4,
      }),
    ).toMatchObject({ credits: 24, isAvailable: true });
  });
  it('resolves fan-out from the model row provider, not the key shape', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      cost: 6,
      key: 'bytedance/seedream-4.5',
      provider: 'fal',
    });
    expect(
      await service.estimate({
        ...input,
        modelKey: 'bytedance/seedream-4.5',
        outputs: 4,
      }),
    ).toMatchObject({ credits: 24, isAvailable: true });
  });
  it('defaults a missing video duration to the Agent tool duration', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      category: ModelCategory.VIDEO,
      costPerUnit: 10,
      pricingType: 'per-second',
    });
    expect(
      await service.estimate({ ...input, category: ModelCategory.VIDEO }),
    ).toMatchObject({ credits: 100, isAvailable: true });
  });
  it('rejects a zero cost without an explicit free designation', async () => {
    validateModelForOrg.mockResolvedValue({ ...model, cost: 0 });
    expect(await service.estimate(input)).toEqual(
      unavailable(AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED),
    );
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
      const quote = await service.estimate(input);
      expect(quote).toMatchObject({
        credits: null,
        isAvailable: false,
        modelKey: null,
      });
      expect(quote.unavailableReason).toBeDefined();
    },
  );
  it.each([
    new BadRequestException('Unknown model: x'),
    new ForbiddenException('Model not enabled for this organization'),
  ])(
    'maps the registry rejection %s to MODEL_UNAVAILABLE without exposing a key',
    async (rejection) => {
      validateModelForOrg.mockRejectedValue(rejection);
      expect(await service.estimate(input)).toEqual(
        unavailable(AgentGenerationQuoteUnavailableReason.MODEL_UNAVAILABLE),
      );
      expect(logger.error).not.toHaveBeenCalled();
    },
  );
  it('logs and reports ERROR for an unexpected registry failure', async () => {
    validateModelForOrg.mockRejectedValue(new Error('db down'));
    expect(await service.estimate(input)).toEqual(
      unavailable(AgentGenerationQuoteUnavailableReason.ERROR),
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
  it('requires a prompt only when the server must route', async () => {
    expect(
      await service.estimate({
        category: ModelCategory.IMAGE,
        organizationId: 'org-1',
      }),
    ).toEqual(
      unavailable(AgentGenerationQuoteUnavailableReason.INSUFFICIENT_INPUT),
    );
    expect(selectModel).not.toHaveBeenCalled();
    const explicit = await service.estimate({
      category: ModelCategory.IMAGE,
      modelKey: model.key,
      organizationId: 'org-1',
    });
    expect(explicit).toMatchObject({ credits: 50, isAvailable: true });
    const dto = Object.assign(new EstimateGenerationCreditsDto(), {
      category: 'image-edit',
      modelKey: model.key,
    });
    expect(await validate(dto)).toEqual([]);
    expect(
      (
        await validate(
          Object.assign(new EstimateGenerationCreditsDto(), {
            category: 'image',
          }),
        )
      ).some((error) => error.property === 'prompt'),
    ).toBe(true);
  });
  it('resolves an Auto image edit through the edit default and quotes the admission quality selector', async () => {
    resolveModelKey.mockResolvedValue({ key: 'ideogram-ai/ideogram-4-5' });
    validateModelForOrg.mockResolvedValue({
      ...model,
      category: ModelCategory.IMAGE_EDIT,
      cost: 20,
      key: 'ideogram-ai/ideogram-4-5',
    });
    // Admission edits at the fixed medium tier, which a legacy flat tariff
    // cannot price exactly; the estimate refuses it for the same reason.
    expect(
      await service.estimate({
        category: 'image-edit',
        organizationId: 'org-1',
        outputs: 4,
      }),
    ).toEqual(
      unavailable(AgentGenerationQuoteUnavailableReason.PRICING_UNRESOLVED),
    );
    expect(resolveModelKey).toHaveBeenCalledWith({
      category: ModelCategory.IMAGE_EDIT,
      organizationId: 'org-1',
    });
    expect(selectModel).not.toHaveBeenCalled();
  });
  it('quotes explicit width and height like admission dimensions', async () => {
    validateModelForOrg.mockResolvedValue({
      ...model,
      cost: 1,
      costPerUnit: 4,
      key: 'fal-ai/flux/dev',
      pricingType: 'per-megapixel',
      provider: 'fal',
    });
    const tall = await service.estimate({
      ...input,
      height: 1920,
      modelKey: 'fal-ai/flux/dev',
      width: 1080,
    });
    const viaDimensions = await service.estimate({
      ...input,
      dimensions: { height: 1920, width: 1080 },
      modelKey: 'fal-ai/flux/dev',
    });
    expect(tall).toEqual(viaDimensions);
  });
  it('rejects an empty aspect ratio at the DTO boundary', async () => {
    const dto = Object.assign(new EstimateGenerationCreditsDto(), {
      aspectRatio: '',
      category: 'image',
      prompt: 'Car',
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'aspectRatio'),
    ).toBe(true);
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
