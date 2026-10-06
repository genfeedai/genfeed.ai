import { testModelCreditQuote } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { AgentGenerationCostToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import { AgentGenerationOptionsToolHandler } from '@api/services/agent-orchestrator/tools/agent-generation-options-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { ModelCategory } from '@genfeedai/contracts';
import { setRuntimeMarginMultiplier } from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

const ctx = {
  brandId: 'thread-brand',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

const SETTINGS = { isEnabled: true, source: 'organization' };
const COST = {
  balance: 42,
  estimate: { credits: 7, status: 'available' },
};
const MODELS = [
  {
    key: 'black-forest-labs/flux-3-image',
    label: 'FLUX.3',
    type: 'image',
  },
];

function setup() {
  const settings = {
    get: vi.fn().mockResolvedValue({
      creditsUsed: 0,
      data: SETTINGS,
      success: true,
    }),
  };
  const cost = {
    execute: vi.fn().mockResolvedValue({
      creditsUsed: 0,
      data: COST,
      success: true,
    }),
  };
  const models = {
    listCallableGenerationModels: vi.fn().mockResolvedValue(MODELS),
  };
  return {
    cost,
    handler: new AgentGenerationOptionsToolHandler(
      settings as never,
      cost as never,
      models as never,
    ),
    models,
    settings,
  };
}

describe('AgentGenerationOptionsToolHandler', () => {
  it('returns settings and callable models when no type is given', async () => {
    const { cost, handler, models, settings } = setup();

    const result = await handler.execute({ brandId: 'brand-2' }, ctx);

    expect(settings.get).toHaveBeenCalledWith({ brandId: 'brand-2' }, ctx);
    expect(models.listCallableGenerationModels).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(cost.execute).not.toHaveBeenCalled();
    expect(result).toEqual({
      creditsUsed: 0,
      data: { models: MODELS, settings: SETTINGS },
      success: true,
    });
    expect(result.data).not.toHaveProperty('cost');
  });

  it('returns settings, callable models for the type, and the estimate when a type is given', async () => {
    const { cost, handler, models } = setup();
    const params = { duration: 8, modelKey: 'model-1', type: 'video' };

    const result = await handler.execute(params, ctx);

    expect(models.listCallableGenerationModels).toHaveBeenCalledWith(
      'org-1',
      'video',
    );
    expect(cost.execute).toHaveBeenCalledWith(params, ctx);
    expect(result).toEqual({
      creditsUsed: 0,
      data: { cost: COST, models: MODELS, settings: SETTINGS },
      success: true,
    });
  });

  it.each(['image', 'image-edit', 'video', 'voice', 'music'])(
    'accepts type %s',
    async (type) => {
      const { handler } = setup();

      const result = await handler.execute({ type }, ctx);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('cost');
    },
  );

  it('treats a null type as absent', async () => {
    const { cost, handler, models } = setup();

    const result = await handler.execute({ type: null }, ctx);

    expect(cost.execute).not.toHaveBeenCalled();
    expect(models.listCallableGenerationModels).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(result.data).toEqual({ models: MODELS, settings: SETTINGS });
  });

  it.each(['gif', 1, ''])(
    'rejects the invalid type %s before reading anything',
    async (type) => {
      const { cost, handler, models, settings } = setup();

      await expect(handler.execute({ type }, ctx)).rejects.toThrow(
        'type must be one of: image, video, voice, music, image-edit',
      );
      expect(settings.get).not.toHaveBeenCalled();
      expect(cost.execute).not.toHaveBeenCalled();
      expect(models.listCallableGenerationModels).not.toHaveBeenCalled();
    },
  );

  it('does not charge credits in either mode', async () => {
    const { handler } = setup();

    expect((await handler.execute({}, ctx)).creditsUsed).toBe(0);
    expect((await handler.execute({ type: 'image' }, ctx)).creditsUsed).toBe(0);
  });

  it('#6199: returns a non-null estimate for a model admission quotes from configured provider USD', async () => {
    setRuntimeMarginMultiplier(1);
    const row = {
      category: ModelCategory.IMAGE,
      cost: 0,
      isActive: true,
      isDeleted: false,
      key: 'google/nano-banana-2-lite',
      organizationId: null,
      pricingType: 'flat',
      provider: 'replicate',
      providerCostUsd: 0.04,
    };
    const estimate = new AgentGenerationEstimateService(
      { selectModel: vi.fn() } as never,
      { validateModelForOrg: vi.fn(async () => row) } as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      testModelCreditQuote({ findOne: async () => row } as never),
      { buildPrompt: vi.fn() } as never,
    );
    const handler = new AgentGenerationOptionsToolHandler(
      {
        get: vi
          .fn()
          .mockResolvedValue({ creditsUsed: 0, data: SETTINGS, success: true }),
      } as never,
      new AgentGenerationCostToolHandler(
        { getOrganizationCreditsBalance: vi.fn(async () => 42) } as never,
        estimate,
      ),
      { listCallableGenerationModels: vi.fn(async () => []) } as never,
    );

    const result = await handler.execute(
      { modelKey: row.key, type: 'image' },
      ctx,
    );

    expect(result.data).toMatchObject({
      cost: {
        estimate: { credits: expect.any(Number), status: 'estimated' },
      },
    });
  });
});
