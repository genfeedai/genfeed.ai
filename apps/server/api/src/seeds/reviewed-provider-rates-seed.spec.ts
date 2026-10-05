import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  RATE_SHEET_REVIEWER,
  seedReviewedProviderRates,
} from '@api/seeds/reviewed-provider-rates-seed';
import {
  applyMargin,
  hashReviewedProviderRates,
  hashReviewedRateSheetEntry,
  quoteModelBillablePricing,
  REVIEWED_RATE_SHEET_ENTRIES,
  type ReviewedRateSheetEntry,
} from '@genfeedai/pricing';
import { describe, expect, it, vi } from 'vitest';

const hailuo = REVIEWED_RATE_SHEET_ENTRIES.find(
  (entry) => entry.endpoint === 'minimax/hailuo-2.3-fast',
);
if (!hailuo) throw new Error('The sheet must carry hailuo-2.3-fast');
const hailuoVersion = hashReviewedProviderRates(hailuo.rates);

function modelRow(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: 'minimax/hailuo-2.3-fast',
    hasAudioToggle: false,
    hasResolutionOptions: false,
    id: 'model-1',
    isFree: false,
    key: 'minimax/hailuo-2.3-fast',
    provider: 'replicate',
    providerInputSchema: {
      properties: {
        duration: { enum: [6, 10] },
        resolution: { enum: ['768p', '1080p'] },
      },
    },
    reviewedProviderContractVersion: null,
    ...overrides,
  };
}

function harness(
  row: ReturnType<typeof modelRow> | null,
  reviewed?: unknown,
  observed?: unknown[],
) {
  const prisma = {
    model: {
      findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    modelProviderContract: {
      findMany: vi.fn().mockResolvedValue(
        observed === undefined
          ? [
              {
                inputSchema: {},
                openapi: {},
                outputSchema: { type: 'string' },
              },
            ]
          : observed,
      ),
      findUnique: vi.fn().mockResolvedValue(reviewed ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return prisma;
}

describe('reviewed provider rates seed', () => {
  it('seeds an approved contract whose version is the rate hash and prices hailuo-2.3-fast', async () => {
    const prisma = harness(modelRow());

    const written = await seedReviewedProviderRates(prisma as never, [hailuo]);

    expect(written).toBe(1);
    const create =
      prisma.modelProviderContract.upsert.mock.calls[0]?.[0].create;
    expect(create).toMatchObject({
      endpoint: 'minimax/hailuo-2.3-fast',
      mappingStatus: 'supported',
      reviewStatus: 'approved',
      reviewedBy: RATE_SHEET_REVIEWER,
      version: hailuoVersion,
    });
    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewedProviderContractVersion: hailuoVersion,
          providerSyncStatus: 'fresh',
        }),
        where: {
          id: 'model-1',
          isDeleted: false,
          organizationId: null,
          reviewedProviderContractVersion: null,
        },
      }),
    );
    const profile = projectModelBillablePricingProfile(
      {
        ...modelRow(),
        cost: 0,
        costPerUnit: null,
        isActive: true,
        isDeleted: false,
        minCost: null,
        pendingProviderContractVersion: null,
        pricingType: 'flat',
        providerCostUsd: null,
        reviewedProviderContractVersion: hailuoVersion,
      } as never,
      [
        {
          ...create,
          discoveredAt: new Date(create.discoveredAt),
          lastSeenAt: new Date(create.lastSeenAt),
        },
      ],
    );
    expect(
      quoteModelBillablePricing(
        profile,
        {
          modelKey: 'minimax/hailuo-2.3-fast',
          provider: 'replicate',
          selectors: { duration: 6, resolution: '768p' },
        },
        3.33,
        '2026-12-31T00:00:00Z',
      ),
    ).toMatchObject({
      snapshot: { credits: applyMargin(0.19, 3.33), providerCostUsd: 0.19 },
      status: 'priced',
    });
  });

  it('is idempotent: a row already on these rates is left alone', async () => {
    const prisma = harness(
      modelRow({ reviewedProviderContractVersion: hailuoVersion }),
    );

    expect(await seedReviewedProviderRates(prisma as never, [hailuo])).toBe(0);
    expect(prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(prisma.model.updateMany).not.toHaveBeenCalled();
  });

  it('skips a model that is not in the registry', async () => {
    const prisma = harness(null);

    expect(await seedReviewedProviderRates(prisma as never, [hailuo])).toBe(0);
  });

  it('never overwrites a contract an operator approved at or after the sheet date', async () => {
    const prisma = harness(
      modelRow({ reviewedProviderContractVersion: 'operator-approved' }),
      {
        pricing: {},
        reviewedAt: new Date('2026-12-01T00:00:00Z'),
        reviewedBy: 'user-1',
      },
    );

    expect(await seedReviewedProviderRates(prisma as never, [hailuo])).toBe(0);
    expect(prisma.model.updateMany).not.toHaveBeenCalled();
  });

  it('replaces an older rate-sheet contract with different rates', async () => {
    const prisma = harness(
      modelRow({ reviewedProviderContractVersion: 'older-sheet' }),
      {
        pricing: {},
        reviewedAt: new Date('2026-01-01T00:00:00Z'),
        reviewedBy: RATE_SHEET_REVIEWER,
      },
    );

    expect(await seedReviewedProviderRates(prisma as never, [hailuo])).toBe(1);
  });

  it('gives FLUX.3 and Ideogram editing the input schema the old seeds shipped', async () => {
    const flux = REVIEWED_RATE_SHEET_ENTRIES.find(
      (entry) => entry.endpoint === 'black-forest-labs/flux-3-image',
    );
    if (!flux) throw new Error('missing flux entry');
    const prisma = harness(
      modelRow({
        endpoint: 'black-forest-labs/flux-3-image',
        key: 'black-forest-labs/flux-3-image',
        providerInputSchema: null,
      }),
    );

    await seedReviewedProviderRates(prisma as never, [flux]);

    expect(prisma.model.updateMany.mock.calls[0]?.[0].data).toMatchObject({
      providerSchemaFamily: 'flux-3-image-v1',
    });
    expect(
      prisma.model.updateMany.mock.calls[0]?.[0].data.providerInputSchema,
    ).toHaveProperty('properties.resolution');
  });

  it('does not overwrite an operator approval that lands during seeding (compare-and-set)', async () => {
    const prisma = harness(modelRow());
    prisma.model.updateMany.mockResolvedValue({ count: 0 });
    const warn = vi.fn();

    expect(
      await seedReviewedProviderRates(prisma as never, [hailuo], { warn }),
    ).toBe(0);
    expect(prisma.model.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: 'model-1',
      reviewedProviderContractVersion: null,
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });

  it('never promotes a contract without an output schema and keeps the model red', async () => {
    const prisma = harness(modelRow(), undefined, [
      { inputSchema: {}, openapi: {}, outputSchema: {} },
    ]);
    const warn = vi.fn();

    expect(
      await seedReviewedProviderRates(prisma as never, [hailuo], { warn }),
    ).toBe(0);
    expect(prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSyncFailureCode: 'rates_unavailable:missing output schema',
        }),
      }),
    );
    expect(prisma.model.updateMany.mock.calls[0]?.[0].data).not.toHaveProperty(
      'reviewedProviderContractVersion',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('missing output schema'),
    );
  });

  it('takes the output schema from the latest observed provider contract', async () => {
    const prisma = harness(modelRow(), undefined, [
      { inputSchema: {}, openapi: {}, outputSchema: {} },
      {
        inputSchema: { properties: {} },
        openapi: { openapi: '3.0.2' },
        outputSchema: { format: 'uri', type: 'string' },
        schemaFamily: 'replicate-video-v1',
      },
    ]);

    await seedReviewedProviderRates(prisma as never, [hailuo]);

    expect(
      prisma.modelProviderContract.upsert.mock.calls[0]?.[0].create,
    ).toMatchObject({
      outputSchema: { format: 'uri', type: 'string' },
      schemaFamily: 'replicate-video-v1',
    });
  });
});

describe('rate sheet frozen variant metadata', () => {
  const entry: ReviewedRateSheetEntry = {
    endpoint: 'openai/gpt-image-2',
    provider: 'replicate',
    sourceUrl: 'https://replicate.com/openai/gpt-image-2',
    verifiedAt: '2026-10-05T00:00:00.000Z',
    rates: [
      {
        component: 'output',
        unit: 'output',
        unitPriceUsd: 0.047,
        when: { model_variant: 'medium' },
      },
    ],
    variantRules: [
      {
        criterionTitle: 'model variant',
        selectorKey: 'model_variant',
        derive: {
          kind: 'field',
          field: 'quality',
          fieldType: 'string',
          valueMap: { medium: 'medium' },
          default: 'medium',
        },
      },
    ],
  };
  it('adds a new contract when unchanged rates gain frozen variant rules', async () => {
    const oldVersion = hashReviewedProviderRates(entry.rates);
    const row = modelRow({
      endpoint: entry.endpoint,
      key: entry.endpoint,
      providerInputSchema: {
        properties: { quality: { enum: ['medium'], type: 'string' } },
      },
      reviewedProviderContractVersion: oldVersion,
    });
    const prisma = harness(row, {
      provider: entry.provider,
      endpoint: entry.endpoint,
      version: oldVersion,
      reviewedBy: RATE_SHEET_REVIEWER,
      discoveredAt: new Date(entry.verifiedAt),
      lastSeenAt: new Date(entry.verifiedAt),
      pricing: {
        currency: 'USD',
        sourceUrl: entry.sourceUrl,
        verifiedAt: entry.verifiedAt,
        rates: entry.rates,
      },
    });
    expect(await seedReviewedProviderRates(prisma as never, [entry])).toBe(1);
    expect(prisma.modelProviderContract.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          version: hashReviewedRateSheetEntry(entry),
          pricing: expect.objectContaining({
            variantRules: entry.variantRules,
          }),
        }),
        update: {},
      }),
    );
    expect(prisma.model.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reviewedProviderContractVersion: oldVersion,
        }),
        data: expect.objectContaining({
          reviewedProviderContractVersion: hashReviewedRateSheetEntry(entry),
        }),
      }),
    );
  });
  it('keeps unchanged metadata idempotent and preserves the existing operator/CAS guards', async () => {
    const prisma = harness(
      modelRow({
        reviewedProviderContractVersion: hashReviewedRateSheetEntry(entry),
      }),
    );
    expect(await seedReviewedProviderRates(prisma as never, [entry])).toBe(0);
    expect(prisma.modelProviderContract.upsert).not.toHaveBeenCalled();
  });
});
