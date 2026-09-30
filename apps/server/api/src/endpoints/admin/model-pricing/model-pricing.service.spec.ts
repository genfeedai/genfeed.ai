import {
  AdminModelPricingService,
  projectAdminModelPricing,
} from '@api/endpoints/admin/model-pricing/model-pricing.service';
import {
  type Model,
  type ModelProviderContract,
  Prisma,
} from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  const actual =
    await vi.importActual<typeof import('@genfeedai/prisma')>(
      '@genfeedai/prisma',
    );
  return { ...canonicalPrismaMock(), Prisma: actual.Prisma };
});

const model = {
  id: 'model',
  key: 'provider/model',
  provider: 'replicate',
  category: 'video',
  lifecycle: 'AVAILABLE',
  isActive: true,
  isFree: false,
  cost: 0,
  costPerUnit: null,
  minCost: null,
  pricingType: 'per-second',
  providerCostUsd: null,
  defaultDuration: 10,
  durations: [5, 10],
  reviewedProviderContractVersion: null,
  pendingProviderContractVersion: null,
  providerInputSchema: null,
  config: { privateKey: 'must-not-escape' },
} as unknown as Model;
const contract = {
  version: 'reviewed',
  pricing: [
    {
      source: 'provider-rate-page',
      sourceUrl: 'https://replicate.com/provider/model',
      verifiedAt: '2026-09-30T00:00:00Z',
    },
  ],
  currency: 'USD',
  billingUnit: 'second',
  unitPrice: '0.2',
  conditionalDimensions: {},
  reviewStatus: 'approved',
  mappingStatus: 'supported',
  lastSeenAt: new Date('2026-09-30T00:00:00Z'),
} as unknown as ModelProviderContract;
const retrievedAt = '2026-09-30T00:00:00Z';

describe('operator model pricing projection', () => {
  it('leaves unknown zero-price configuration unresolved and excludes provider config', () => {
    const row = projectAdminModelPricing(model, [], 1, retrievedAt);
    expect(row.status).toBe('unresolved');
    expect(row.effectiveSampleCredits).toBeNull();
    expect(row.reasons.join(' ')).toContain('not an explicit free model');
    expect(JSON.stringify(row)).not.toContain('must-not-escape');
  });
  it('reports the approved scalar unit rate and a correctly metered single-output sample', () => {
    const row = projectAdminModelPricing(
      {
        ...model,
        providerCostUsd: 0.2,
        reviewedProviderContractVersion: 'reviewed',
      },
      [contract],
      1,
      retrievedAt,
    );
    expect(row.status).toBe('verified');
    expect(row.effectiveUnitCredits).toBe(20);
    expect(row.effectiveSampleCredits).toBe(200);
  });
  it('reports mismatch and missing quantities without inventing a fallback duration', () => {
    const row = projectAdminModelPricing(
      {
        ...model,
        providerCostUsd: 0.1,
        defaultDuration: null,
        reviewedProviderContractVersion: 'reviewed',
      },
      [contract],
      1,
      retrievedAt,
    );
    expect(row.status).toBe('discrepant');
    expect(row.effectiveSampleCredits).toBeNull();
  });
  it('conditional or stale evidence cannot be verified as a scalar quote', () => {
    const configured = {
      ...model,
      providerCostUsd: 0.2,
      reviewedProviderContractVersion: 'reviewed',
    };
    expect(
      projectAdminModelPricing(
        configured,
        [{ ...contract, conditionalDimensions: { resolution: '1080p' } }],
        1,
        retrievedAt,
      ).status,
    ).toBe('unresolved');
    expect(
      projectAdminModelPricing(
        configured,
        [
          {
            ...contract,
            pricing: [
              {
                sourceUrl: 'https://replicate.com/provider/model',
                verifiedAt: '2026-01-01',
              },
            ],
          },
        ],
        1,
        retrievedAt,
      ).status,
    ).toBe('unresolved');
  });
  it('registry observations, unsupported mapping and pending drift cannot count as verified', () => {
    const configured = {
      ...model,
      providerCostUsd: 0.2,
      reviewedProviderContractVersion: 'reviewed',
    };
    for (const candidate of [
      { ...contract, pricing: [{ source: 'curated-known-cost' }] },
      { ...contract, mappingStatus: 'quarantined' },
      { ...contract, unitPrice: null },
      { ...contract, unitPrice: 'NaN' },
    ])
      expect(
        projectAdminModelPricing(configured, [candidate], 1, retrievedAt)
          .status,
      ).toBe('unresolved');
    const pending = {
      ...contract,
      version: 'new',
      unitPrice: '0.4',
      reviewStatus: 'pending',
    };
    const row = projectAdminModelPricing(
      { ...configured, pendingProviderContractVersion: 'new' },
      [contract, pending],
      1,
      retrievedAt,
    );
    expect(row.status).toBe('unresolved');
    expect(row.pending?.unitPrice).toBe('0.4');
    expect(row.reasons.join(' ')).toContain('Pending provider contract');
  });
  it('does not invent a conversion policy when platform settings are absent', () => {
    const row = projectAdminModelPricing(
      { ...model, providerCostUsd: 0.2 },
      [],
      null,
      retrievedAt,
    );
    expect(row.effectiveUnitCredits).toBeNull();
    expect(row.status).toBe('unresolved');
  });
  it('reads only the global nondeleted catalog and policy in one repeatable-read snapshot', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ ...model, providerContracts: [] }]);
    const findFirst = vi.fn().mockResolvedValue(null);
    const transaction = { model: { findMany }, platformSetting: { findFirst } };
    const transact = vi.fn(
      async (
        fn: (client: typeof transaction) => Promise<unknown>,
        _options: unknown,
      ) => fn(transaction),
    );
    const report = await new AdminModelPricingService({
      $transaction: transact,
    } as never).getReport('https://api.example/admin/model-pricing');
    expect(findMany.mock.calls[0]?.[0].where).toEqual({
      organizationId: null,
      isDeleted: false,
    });
    expect(findFirst.mock.calls[0]?.[0].where).toEqual({
      key: 'platform',
      isDeleted: false,
    });
    expect(transact.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(report.isConversionPolicyConfigured).toBe(false);
  });
});
