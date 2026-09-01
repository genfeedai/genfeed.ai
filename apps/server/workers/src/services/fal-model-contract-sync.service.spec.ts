import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelProvider } from '@genfeedai/enums';
import type { ModelsService } from '@server/collections/models/services/models.service';
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

function harness() {
  const modelProviderContract = { upsert: vi.fn() };
  const model = { update: vi.fn(), updateMany: vi.fn() };
  const service = new FalModelContractSyncService({
    prisma: { model, modelProviderContract },
  } as unknown as ModelsService);

  modelProviderContract.upsert.mockImplementation(({ create }) =>
    Promise.resolve({ ...create, id: 'contract-1' }),
  );
  model.update.mockResolvedValue({ id: 'model-1' });
  model.updateMany.mockResolvedValue({ count: 1 });
  return { model, modelProviderContract, service };
}

describe('FalModelContractSyncService', () => {
  it('stores an exact candidate and leaves a new endpoint inactive until review', async () => {
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
        isActive: false,
        isDefault: false,
        pendingProviderContractVersion: result.version,
        providerSyncStatus: 'review_required',
      }),
      where: { id: 'model-1' },
    });
  });

  it('flags material drift while preserving reviewed execution and pricing fields', async () => {
    const { model, service } = harness();

    const result = await service.synchronizeModel(
      {
        endpoint: 'fal-ai/per-image',
        id: 'model-1',
        isActive: true,
        provider: ModelProvider.FAL,
        reviewedProviderContractVersion: 'sha256:reviewed',
      },
      providerModel(),
      price('fal-ai/per-image'),
    );

    expect(result.drifted).toBe(true);
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).not.toHaveProperty('providerInputSchema');
    expect(update.data).not.toHaveProperty('providerSchemaFamily');
    expect(update.data).not.toHaveProperty('providerCostUsd');
    expect(update.data).not.toHaveProperty('pricingType');
    expect(update.data).not.toHaveProperty('reviewedProviderContractVersion');
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
