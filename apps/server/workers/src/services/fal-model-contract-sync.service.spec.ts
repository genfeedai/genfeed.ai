import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { ModelProvider } from '@genfeedai/contracts';
import type { IFalModel } from '@workers/interfaces/model-discovery.interface';
import { FalModelContractSyncService } from '@workers/services/fal-model-contract-sync.service';
import { hashProviderContract } from '@workers/services/provider-contract.util';

const fixtureDir = fileURLToPath(
  new URL('../../test/fixtures/fal/', import.meta.url),
);
const imageOpenapi = JSON.parse(
  readFileSync(join(fixtureDir, 'image-openapi.json'), 'utf8'),
) as Record<string, unknown>;
const pricingFixture = JSON.parse(
  readFileSync(join(fixtureDir, 'pricing.json'), 'utf8'),
) as { prices: Array<Record<string, unknown>> };

function providerModel(endpoint = 'fal-ai/per-image'): IFalModel {
  return {
    endpoint_id: endpoint,
    metadata: { category: 'image-to-image', status: 'active' },
    openapi: imageOpenapi,
  };
}

function price(endpoint: string): Array<Record<string, unknown>> {
  return pricingFixture.prices.filter(
    (candidate) => candidate.endpoint_id === endpoint,
  );
}

const reviewedContract = {
  conditionalDimensions: {},
  discoveredAt: new Date('2026-08-01T00:00:00Z'),
  endpoint: 'fal-ai/per-image',
  id: 'reviewed-contract',
  lastSeenAt: new Date('2026-09-01T00:00:00Z'),
  inputSchema: { type: 'object' },
  mappingStatus: 'supported',
  openapi: { openapi: '3.0.0' },
  outputSchema: { type: 'object' },
  pricing: [
    {
      conditionalDimensions: {},
      currency: 'USD',
      endpoint: 'fal-ai/per-image',
      unit: 'image',
      unitPrice: '0.025',
    },
  ],
  provider: ModelProvider.FAL,
  reviewStatus: 'approved',
  version: 'sha256:reviewed',
};
const reviewedModel = {
  endpoint: 'fal-ai/per-image',
  id: 'model-1',
  isActive: true,
  key: 'fal-ai/per-image',
  provider: ModelProvider.FAL,
  reviewedProviderContractVersion: 'sha256:reviewed',
};

function harness(reviewed: typeof reviewedContract | null = null) {
  const modelProviderContract = {
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
  const model = { update: vi.fn(), updateMany: vi.fn() };
  const service = new FalModelContractSyncService({
    prisma: { model, modelProviderContract },
  } as unknown as ModelsService);

  modelProviderContract.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ ...create, id: 'contract-1' }),
  );
  modelProviderContract.findUnique.mockResolvedValue(reviewed);
  modelProviderContract.update.mockResolvedValue({});
  model.update.mockResolvedValue({ id: 'model-1' });
  model.updateMany.mockResolvedValue({ count: 1 });
  return { model, modelProviderContract, service };
}

describe('FalModelContractSyncService', () => {
  it('stores an exact candidate and stamps a pending candidate for a new endpoint', async () => {
    const { model, modelProviderContract, service } = harness();
    const now = new Date('2026-08-22T10:00:00.000Z');

    const result = await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-image',
        id: 'model-1',
        isActive: false,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: null,
      },
      providerModel(),
      price('fal-ai/per-image'),
      now,
    );

    expect(result).toMatchObject({ drifted: false, quarantined: false });
    expect(modelProviderContract.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          billingUnit: 'image',
          currency: 'USD',
          endpoint: 'fal-ai/per-image',
          mappingStatus: 'supported',
          modelId: 'model-1',
          provider: ModelProvider.FAL,
          unitPrice: '0.025',
          unitPriceMicros: 25_000n,
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
    expect(model.update.mock.calls[0]?.[0].data).not.toHaveProperty('isActive');
  });

  it('keeps the reviewed rate and reports old and new prices when the provider changes a price', async () => {
    const { model, service } = harness({
      ...reviewedContract,
      pricing: [{ ...reviewedContract.pricing[0], unitPrice: '0.02' }],
    });

    const result = await service.synchronizeModel(
      reviewedModel,
      providerModel(),
      price('fal-ai/per-image'),
    );

    expect(result.drifted).toBe(true);
    expect(result.priceChange).toMatchObject({
      changes: [{ newPriceUsd: 0.025, oldPriceUsd: 0.02 }],
      modelKey: 'fal-ai/per-image',
      provider: 'fal',
    });
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      pendingProviderContractVersion: result.version,
      providerSyncStatus: 'review_required',
    });
    for (const field of [
      'isActive',
      'isDefault',
      'providerInputSchema',
      'providerSchemaFamily',
      'providerCostUsd',
      'pricingType',
      'reviewedProviderContractVersion',
    ])
      expect(update.data).not.toHaveProperty(field);
  });

  it('re-verifies the reviewed contract when the same rates are observed, even after a schema change', async () => {
    const { model, modelProviderContract, service } = harness(reviewedContract);
    const now = new Date('2026-12-05T00:00:00.000Z');

    const result = await service.synchronizeModel(
      reviewedModel,
      {
        ...providerModel(),
        openapi: { ...imageOpenapi, info: { title: 'schema changed' } },
      },
      price('fal-ai/per-image'),
      now,
    );

    expect(result.drifted).toBe(false);
    expect(result.priceChange).toBeUndefined();
    expect(modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(modelProviderContract.update).toHaveBeenCalledWith({
      data: { lastSeenAt: now },
      where: { id: 'reviewed-contract' },
    });
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      pendingProviderContractVersion: null,
      providerSyncStatus: 'fresh',
    });
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('isDefault');
  });

  it('fails the refresh, keeping the reviewed rate, when no readable price is returned', async () => {
    const { model, service } = harness(reviewedContract);

    const result = await service.synchronizeModel(
      reviewedModel,
      providerModel(),
      [],
    );

    expect(result.refreshFailure).toMatchObject({
      modelKey: 'fal-ai/per-image',
      provider: 'fal',
    });
    expect(result.refreshFailure?.reason).toContain(
      'rates_unavailable:missing_pricing',
    );
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({ providerSyncStatus: 'failed' });
    expect(update.data).not.toHaveProperty('pendingProviderContractVersion');
    expect(update.data).not.toHaveProperty('isActive');
  });

  it('preserves a legacy active endpoint until its first contract is reviewed', async () => {
    const { model, service } = harness();

    const result = await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-image',
        id: 'model-1',
        isActive: true,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: null,
      },
      providerModel(),
      price('fal-ai/per-image'),
    );

    const update = model.update.mock.calls[0]?.[0];
    expect(update.data.pendingProviderContractVersion).toBe(result.version);
    expect(update.data.providerSyncStatus).toBe('review_required');
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('isDefault');
  });

  it('marks the reviewed version fresh without changing activation', async () => {
    const { model, service } = harness();
    const first = await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-image',
        id: 'model-1',
        isActive: true,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: null,
      },
      providerModel(),
      price('fal-ai/per-image'),
    );
    vi.clearAllMocks();
    model.update.mockResolvedValue({ id: 'model-1' });

    await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-image',
        id: 'model-1',
        isActive: true,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: first.version,
      },
      providerModel(),
      price('fal-ai/per-image'),
    );

    const update = model.update.mock.calls[0]?.[0];
    expect(update.data.providerSyncStatus).toBe('fresh');
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('isDefault');
  });

  it('quarantines unsupported token billing and conditional pricing', async () => {
    for (const endpoint of ['fal-ai/per-token', 'fal-ai/conditional-image']) {
      const { model, modelProviderContract, service } = harness();
      await service.synchronizeModel(
        {
          endpoint,
          id: `model-${endpoint}`,
          isActive: true,
          provider: ModelProvider.FAL,
          reviewedProviderContractVersion: null,
        },
        providerModel(endpoint),
        price(endpoint),
      );

      expect(
        modelProviderContract.upsert.mock.calls[0]?.[0].create,
      ).toMatchObject({
        mappingStatus: 'quarantined',
        reviewStatus: 'quarantined',
      });
      expect(model.update.mock.calls[0]?.[0].data.providerSyncStatus).toBe(
        'quarantined',
      );
    }
  });

  it('preserves the schema failure reason when pricing is also unsupported', async () => {
    const { modelProviderContract, service } = harness();

    await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-token',
        id: 'model-1',
        isActive: false,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: null,
      },
      { ...providerModel('fal-ai/per-token'), openapi: {} },
      price('fal-ai/per-token'),
    );

    expect(
      modelProviderContract.upsert.mock.calls[0]?.[0].create.unsupportedReason,
    ).toBe('invalid_or_missing_openapi');
  });

  it('records sanitized failure state without mutating the reviewed contract', async () => {
    const { model, service } = harness();
    const now = new Date('2026-08-22T12:00:00.000Z');

    await service.recordFailure('pricing_fetch_failed', now);

    expect(model.updateMany).toHaveBeenCalledWith({
      data: {
        providerSyncFailedAt: now,
        providerSyncFailureCode: 'pricing_fetch_failed',
        providerSyncStatus: 'failed',
      },
      where: {
        isDeleted: false,
        organizationId: null,
        provider: ModelProvider.FAL,
      },
    });
  });

  it('hashes object-key order deterministically', () => {
    expect(hashProviderContract({ a: 1, nested: { x: 2, y: 3 } })).toBe(
      hashProviderContract({ nested: { y: 3, x: 2 }, a: 1 }),
    );
  });
});
