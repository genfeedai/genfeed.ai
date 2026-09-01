import { ModelCategory, ModelProvider, PricingType } from '@genfeedai/enums';
import type { ModelsService } from '@server/collections/models/services/models.service';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';
import { ReplicateModelContractSyncService } from '@workers/services/replicate-model-contract-sync.service';

function providerModel(openapi = validOpenapi()): IReplicateModel {
  return {
    default_example: null,
    description: 'Image generator',
    latest_version: {
      cog_version: 'cog-v1',
      created_at: '2026-08-01T00:00:00.000Z',
      id: 'provider-version-1',
      openapi_schema: openapi,
    },
    name: 'imagen-4',
    owner: 'google',
    run_count: 1,
    url: 'https://replicate.com/google/imagen-4',
    visibility: 'public',
  };
}

function validOpenapi(): Record<string, unknown> {
  return {
    components: {
      schemas: {
        Input: {
          properties: { prompt: { type: 'string' } },
          required: ['prompt'],
          type: 'object',
        },
        Output: { format: 'uri', type: 'string' },
      },
    },
    openapi: '3.0.2',
  };
}

function registryModel(reviewedVersion: string | null = null) {
  return {
    category: ModelCategory.IMAGE,
    endpoint: 'google/imagen-4',
    id: 'model-1',
    isActive: true,
    pricingType: PricingType.PER_REQUEST,
    providerCostUsd: 0.04,
    reviewedProviderContractVersion: reviewedVersion,
  };
}

function pricing(unitPriceUsd: number | null = 0.04) {
  return {
    pricingType: PricingType.PER_REQUEST,
    source: 'curated-known-cost' as const,
    unitPriceUsd,
  };
}

function harness() {
  const modelProviderContract = { upsert: vi.fn() };
  const model = { update: vi.fn(), updateMany: vi.fn() };
  const service = new ReplicateModelContractSyncService({
    prisma: { model, modelProviderContract },
  } as unknown as ModelsService);

  modelProviderContract.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ ...create, id: 'contract-1' }),
  );
  model.update.mockResolvedValue({ id: 'model-1' });
  model.updateMany.mockResolvedValue({ count: 1 });
  return { model, modelProviderContract, service };
}

describe('ReplicateModelContractSyncService', () => {
  it('stores the exact OpenAPI and curated pricing as a pending contract', async () => {
    const { model, modelProviderContract, service } = harness();
    const now = new Date('2026-09-01T10:00:00.000Z');

    const result = await service.synchronizeModel(
      registryModel(),
      providerModel(),
      ModelCategory.IMAGE,
      pricing(),
      now,
    );

    expect(result).toMatchObject({ drifted: false, quarantined: false });
    expect(modelProviderContract.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          billingUnit: 'request',
          endpoint: 'google/imagen-4',
          mappingStatus: 'supported',
          modelId: 'model-1',
          openapi: validOpenapi(),
          pricingType: PricingType.PER_REQUEST,
          provider: ModelProvider.REPLICATE,
          schemaFamily: 'replicate-image-v1',
          unitPriceMicros: 40_000n,
        }),
      }),
    );
    expect(model.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        pendingProviderContractVersion: result.version,
        providerSyncStatus: 'review_required',
      }),
      where: { id: 'model-1' },
    });
  });

  it('turns either schema or price drift into a new version without mutating runtime fields', async () => {
    const { model, service } = harness();

    const result = await service.synchronizeModel(
      registryModel('sha256:reviewed'),
      providerModel(),
      ModelCategory.IMAGE,
      pricing(0.05),
    );

    expect(result.drifted).toBe(true);
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).not.toHaveProperty('providerCostUsd');
    expect(update.data).not.toHaveProperty('providerInputSchema');
    expect(update.data).not.toHaveProperty('pricingType');
    expect(update.data).not.toHaveProperty('reviewedProviderContractVersion');
  });

  it('quarantines contracts with missing schema or reviewed pricing', async () => {
    for (const [model, candidatePricing] of [
      [providerModel({}), pricing()],
      [providerModel(), pricing(null)],
    ] as const) {
      const harnessResult = harness();
      await harnessResult.service.synchronizeModel(
        registryModel(),
        model,
        ModelCategory.IMAGE,
        candidatePricing,
      );

      expect(
        harnessResult.modelProviderContract.upsert.mock.calls[0]?.[0].create,
      ).toMatchObject({
        mappingStatus: 'quarantined',
        reviewStatus: 'quarantined',
      });
    }
  });

  it('marks an already reviewed version fresh', async () => {
    const { model, service } = harness();
    const first = await service.synchronizeModel(
      registryModel(),
      providerModel(),
      ModelCategory.IMAGE,
      pricing(),
    );
    vi.clearAllMocks();
    model.update.mockResolvedValue({ id: 'model-1' });

    await service.synchronizeModel(
      registryModel(first.version),
      providerModel(),
      ModelCategory.IMAGE,
      pricing(),
    );

    expect(model.update.mock.calls[0]?.[0].data).toMatchObject({
      pendingProviderContractVersion: null,
      providerSyncStatus: 'fresh',
    });
  });

  it('records sanitized provider failure state', async () => {
    const { model, service } = harness();
    const now = new Date('2026-09-01T12:00:00.000Z');

    await service.recordFailure('model_fetch_failed', now, 'model-1');

    expect(model.updateMany).toHaveBeenCalledWith({
      data: {
        providerSyncFailedAt: now,
        providerSyncFailureCode: 'model_fetch_failed',
        providerSyncStatus: 'failed',
      },
      where: {
        id: 'model-1',
        isDeleted: false,
        organizationId: null,
        provider: ModelProvider.REPLICATE,
      },
    });
  });
});
