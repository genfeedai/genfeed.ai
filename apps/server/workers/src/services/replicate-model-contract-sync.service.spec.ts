import type { ModelsService } from '@api/collections/models/services/models.service';
import {
  ModelCategory,
  ModelProvider,
  PricingType,
} from '@genfeedai/contracts';
import type { ReviewedProviderRate } from '@genfeedai/contracts/interfaces';
import { hashReviewedProviderRates } from '@genfeedai/pricing';
import type { IReplicateModel } from '@workers/interfaces/model-discovery.interface';
import {
  HAILUO_2_3_FAST_BILLING_TIERS,
  HAILUO_2_3_FAST_INPUT_PROPERTIES,
} from '@workers/services/replicate-billing-config.fixture';
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

function validOpenapi(
  properties: Record<string, unknown> = { prompt: { type: 'string' } },
): Record<string, unknown> {
  return {
    components: {
      schemas: {
        Input: { properties, required: ['prompt'], type: 'object' },
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
    key: 'google/imagen-4',
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

const variantProperties = {
  ...HAILUO_2_3_FAST_INPUT_PROPERTIES,
  prompt: { type: 'string' },
};
const sourceUrl = 'https://replicate.com/google/imagen-4';
const reviewedRates: ReviewedProviderRate[] = [
  {
    component: 'output',
    unit: 'output',
    unitPriceUsd: 0.19,
    when: { resolution: '768P', duration: 6 },
  },
  {
    component: 'output',
    unit: 'output',
    unitPriceUsd: 0.32,
    when: { resolution: '768P', duration: 10 },
  },
  {
    component: 'output',
    unit: 'output',
    unitPriceUsd: 0.33,
    when: { resolution: '1080P', duration: 6 },
  },
];
const reviewedVersion = hashReviewedProviderRates(reviewedRates);
const reviewedContract = {
  discoveredAt: new Date('2026-10-01T00:00:00Z'),
  endpoint: 'google/imagen-4',
  id: 'reviewed-contract',
  lastSeenAt: new Date('2026-10-01T00:00:00Z'),
  mappingStatus: 'supported',
  pricing: {
    currency: 'USD',
    rates: reviewedRates,
    source: 'provider-model-page',
    sourceUrl,
    verifiedAt: '2026-09-01T00:00:00.000Z',
  },
  provider: ModelProvider.REPLICATE,
  reviewStatus: 'approved',
  version: reviewedVersion,
};
const billing = {
  sourceUrl,
  status: 'ok' as const,
  tiers: HAILUO_2_3_FAST_BILLING_TIERS,
};

function harness(reviewed: typeof reviewedContract | null = null) {
  const modelProviderContract = {
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
  const model = { update: vi.fn(), updateMany: vi.fn() };
  const service = new ReplicateModelContractSyncService({
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

  it('stores the rates the model page states as a pending contract for an unreviewed model', async () => {
    const { modelProviderContract, service } = harness();
    const now = new Date('2026-10-05T00:00:00.000Z');

    await service.synchronizeModel(
      registryModel(),
      providerModel(validOpenapi(variantProperties)),
      ModelCategory.IMAGE,
      { ...pricing(), billing },
      now,
    );

    const create = modelProviderContract.upsert.mock.calls[0]?.[0].create;
    expect(create).toMatchObject({
      billingUnit: 'output',
      mappingStatus: 'supported',
      pricingType: 'conditional',
      unitPrice: null,
    });
    expect(create.pricing).toMatchObject({
      currency: 'USD',
      source: 'replicate-billing-config',
      sourceUrl,
      verifiedAt: now.toISOString(),
    });
    expect(create.pricing.rates).toHaveLength(3);
  });

  it('keeps a stable version while only the verification date moves', async () => {
    const first = harness();
    const second = harness();
    const run = (service: ReplicateModelContractSyncService, now: Date) =>
      service.synchronizeModel(
        registryModel(),
        providerModel(validOpenapi(variantProperties)),
        ModelCategory.IMAGE,
        { ...pricing(), billing },
        now,
      );

    const a = await run(first.service, new Date('2026-10-05T00:00:00Z'));
    const b = await run(second.service, new Date('2026-10-06T00:00:00Z'));

    expect(a.version).toBe(b.version);
  });

  it('re-verifies the reviewed contract and keeps the model active when the same rates are observed', async () => {
    const { model, modelProviderContract, service } = harness(reviewedContract);
    const now = new Date('2026-12-05T00:00:00.000Z');

    const result = await service.synchronizeModel(
      registryModel(reviewedVersion),
      providerModel(validOpenapi(variantProperties)),
      ModelCategory.IMAGE,
      { ...pricing(), billing },
      now,
    );

    expect(result).toMatchObject({ drifted: false, quarantined: false });
    expect(result.priceChange).toBeUndefined();
    expect(modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(modelProviderContract.update).toHaveBeenCalledWith({
      data: {
        lastSeenAt: now,
        pricing: expect.objectContaining({
          rates: reviewedRates,
          verifiedAt: now.toISOString(),
        }),
      },
      where: { id: 'reviewed-contract' },
    });
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      pendingProviderContractVersion: null,
      providerPricingSyncedAt: now,
      providerSyncStatus: 'fresh',
    });
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('isDefault');
  });

  it('does not block or deactivate on a schema-only change', async () => {
    const { model, service } = harness(reviewedContract);

    const result = await service.synchronizeModel(
      registryModel(reviewedVersion),
      providerModel(
        validOpenapi({
          ...variantProperties,
          negative_prompt: { type: 'string' },
        }),
      ),
      ModelCategory.IMAGE,
      { ...pricing(), billing },
    );

    expect(result.drifted).toBe(false);
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data.providerSyncStatus).toBe('fresh');
    expect(update.data.pendingProviderContractVersion).toBeNull();
    expect(update.data).not.toHaveProperty('isActive');
    expect(update.data).not.toHaveProperty('isDefault');
  });

  it('keeps the reviewed rate and reports old and new prices when the provider changes a price', async () => {
    const { model, service } = harness(reviewedContract);
    const changedTiers = HAILUO_2_3_FAST_BILLING_TIERS.map((tier, index) =>
      index === 0
        ? {
            ...tier,
            prices: [
              {
                metric: 'video_output_count',
                price: '$0.21',
                title: 'per output video',
                type: 'per-unit',
              },
            ],
          }
        : tier,
    );

    const result = await service.synchronizeModel(
      registryModel(reviewedVersion),
      providerModel(validOpenapi(variantProperties)),
      ModelCategory.IMAGE,
      { ...pricing(), billing: { ...billing, tiers: changedTiers } },
    );

    expect(result.drifted).toBe(true);
    expect(result.priceChange).toMatchObject({
      changes: [
        {
          newPriceUsd: 0.21,
          oldPriceUsd: 0.19,
          variant: 'duration=6 · resolution=768P',
        },
      ],
      modelKey: 'google/imagen-4',
      provider: 'replicate',
      sourceUrl,
    });
    expect(result.priceChange?.pendingRateHash).toMatch(/^rates:sha256:/);
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      pendingProviderContractVersion: result.version,
      providerSyncStatus: 'review_required',
    });
    for (const field of [
      'isActive',
      'isDefault',
      'providerCostUsd',
      'providerInputSchema',
      'pricingType',
      'reviewedProviderContractVersion',
    ])
      expect(update.data).not.toHaveProperty(field);
  });

  it('fails the refresh for one model, keeping its reviewed rate, when a criterion cannot be mapped', async () => {
    const { model, service } = harness(reviewedContract);

    const result = await service.synchronizeModel(
      registryModel(reviewedVersion),
      providerModel(validOpenapi(variantProperties)),
      ModelCategory.IMAGE,
      {
        ...pricing(),
        billing: {
          ...billing,
          tiers: [
            {
              criteria: [
                {
                  subtype: 'string',
                  title: 'camera motion',
                  type: 'equals',
                  value: 'pan',
                },
              ],
              prices: [{ metric: 'video_output_count', price: '$0.20' }],
            },
          ],
        },
      },
    );

    expect(result.refreshFailure?.reason).toContain(
      'rates_unavailable:unmapped_criterion:camera motion',
    );
    const update = model.update.mock.calls[0]?.[0];
    expect(update.data).toMatchObject({
      providerSyncFailureCode:
        'rates_unavailable:unmapped_criterion:camera motion',
      providerSyncStatus: 'failed',
    });
    expect(update.data).not.toHaveProperty('pendingProviderContractVersion');
    expect(update.data).not.toHaveProperty('isActive');
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
