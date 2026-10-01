import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import {
  AgentGenerationCostToolHandler,
  toStudioGenerationCostModel,
} from '@api/services/agent-orchestrator/tools/agent-generation-cost-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  ModelCategory,
  ModelLifecycle,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import {
  buildStudioGenerationCostSettings,
  resolveStudioGenerationCost,
} from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

function catalogRow(overrides: Partial<ModelDocument> = {}): ModelDocument {
  return {
    category: ModelCategory.IMAGE,
    cost: 7,
    costPerUnit: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    id: 'model-1',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    isFree: false,
    key: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
    label: 'Imagen',
    lifecycle: ModelLifecycle.AVAILABLE,
    minCost: null,
    organizationId: 'org-1',
    pendingProviderContractVersion: null,
    pricingType: PricingType.FLAT,
    provider: ModelProvider.REPLICATE,
    providerSyncStatus: 'fresh',
    reviewStatus: 'approved',
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...overrides,
  } as ModelDocument;
}

function setup(options?: {
  balance?: number | Error;
  model?: ModelDocument | null;
}) {
  const balance = options?.balance ?? 42;
  const model = options && 'model' in options ? options.model : catalogRow();
  const creditsUtilsService = {
    getOrganizationCreditsBalance: vi.fn(async () => {
      if (balance instanceof Error) throw balance;
      return balance;
    }),
  };
  const modelsService = {
    findOne: vi.fn(async () => model ?? null),
  };
  return {
    creditsUtilsService,
    handler: new AgentGenerationCostToolHandler(
      creditsUtilsService as never,
      modelsService as never,
    ),
    modelsService,
  };
}

describe('AgentGenerationCostToolHandler', () => {
  it('returns the composer estimate and the credits-bar balance for the authenticated org', async () => {
    const model = catalogRow();
    const { handler, modelsService } = setup({ balance: 42, model });
    const result = await handler.execute(
      {
        aspectRatio: '1:1',
        modelKey: model.key,
        organizationId: 'other-org',
        outputs: 1,
        resolution: '1K',
        type: 'image',
      },
      ctx,
    );
    const priced = toStudioGenerationCostModel(model);
    if (!priced) throw new Error('expected a priced catalog row');

    expect(modelsService.findOne).toHaveBeenCalledWith({
      isDeleted: false,
      key: model.key,
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      creditsUsed: 0,
      data: {
        balance: 42,
        estimate: resolveStudioGenerationCost({
          isLoadingModels: false,
          model: priced,
          settings: buildStudioGenerationCostSettings('image', {
            aspectRatio: '1:1',
            modelKey: model.key,
            outputs: 1,
            resolution: '1K',
          }),
          type: 'image',
        }),
      },
      success: true,
    });
  });

  it('keeps a numeric zero balance', async () => {
    const { handler } = setup({ balance: 0, model: null });
    const result = await handler.execute({ type: 'image' }, ctx);
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: { balance: 0, estimate: { credits: null, status: 'auto' } },
      success: true,
    });
  });

  it('returns a null balance when the wallet read fails', async () => {
    const { handler } = setup({ balance: new Error('wallet down') });
    const result = await handler.execute(
      { modelKey: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4, type: 'image' },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(0);
    expect(result.data?.balance).toBeNull();
    expect(result.data?.balance).not.toBe(0);
  });

  it('does not look up Auto and reports status auto', async () => {
    const { handler, modelsService } = setup();
    const omitted = await handler.execute({ type: 'video' }, ctx);
    const explicit = await handler.execute(
      { modelKey: 'auto', type: 'image' },
      ctx,
    );
    const blank = await handler.execute(
      { modelKey: '   ', type: 'image' },
      ctx,
    );
    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(omitted.data?.estimate).toEqual({ credits: null, status: 'auto' });
    expect(explicit.data?.estimate).toEqual({ credits: null, status: 'auto' });
    expect(blank.data?.estimate).toEqual({ credits: null, status: 'auto' });
  });

  it('returns unavailable for a bad request and still returns the balance', async () => {
    const { handler, modelsService } = setup({ balance: 9 });
    const result = await handler.execute({ type: 'music' }, ctx);
    expect(modelsService.findOne).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      creditsUsed: 0,
      data: { balance: 9, estimate: { credits: null, status: 'unavailable' } },
      success: true,
    });
  });

  it('returns unavailable when the catalog tariff is not one the composer prices', async () => {
    const model = catalogRow({ pricingType: 'per-token' });
    const { handler, modelsService } = setup({ model });
    const result = await handler.execute(
      { modelKey: model.key, type: 'image' },
      ctx,
    );
    expect(modelsService.findOne).toHaveBeenCalledTimes(1);
    expect(toStudioGenerationCostModel(model)).toBeNull();
    expect(result.data?.estimate).toEqual({
      credits: null,
      status: 'unavailable',
    });
  });

  it('returns unavailable when the model is missing', async () => {
    const { handler } = setup({ model: null });
    const result = await handler.execute(
      { modelKey: 'replicate/missing', type: 'image' },
      ctx,
    );
    expect(result.data).toMatchObject({
      balance: 42,
      estimate: { credits: null, status: 'unavailable' },
    });
  });

  it('does not coerce a non-finite balance to zero', async () => {
    const { handler } = setup({ balance: Number.NaN, model: null });
    const result = await handler.execute({ type: 'image' }, ctx);
    expect(result.data?.balance).toBeNull();
  });
});
