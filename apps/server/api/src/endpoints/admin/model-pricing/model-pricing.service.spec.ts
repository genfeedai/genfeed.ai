import {
  buildGuardedDelegate,
  type GuardedRow,
} from '@api/collections/models/testing/cloud-guarded-delegate';
import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  AdminModelPricingService,
  projectAdminModelPricing,
} from '@api/endpoints/admin/model-pricing/model-pricing.service';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import {
  type Model,
  type ModelProviderContract,
  Prisma,
} from '@genfeedai/prisma';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';
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
              },
            ],
          },
        ],
        1,
        retrievedAt,
      ).status,
    ).toBe('unresolved');
  });
  it('does not call old evidence stale: rates are refreshed, never expired', () => {
    const row = projectAdminModelPricing(
      {
        ...model,
        providerCostUsd: 0.2,
        reviewedProviderContractVersion: 'reviewed',
      },
      [
        {
          ...contract,
          pricing: [
            {
              source: 'provider-rate-page',
              sourceUrl: 'https://replicate.com/provider/model',
              verifiedAt: '2026-01-01T00:00:00Z',
            },
          ],
        },
      ],
      1,
      retrievedAt,
    );
    expect(row.status).toBe('verified');
    expect(row.reasons.join(' ')).not.toContain('30 days');
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
  });
  describe('rate-based evidence (#6196)', () => {
    const rates = [
      {
        c: 'video_output_count',
        price: 0.19,
        when: { resolution: '768P', duration: 6 },
      },
      {
        c: 'video_output_count',
        price: 0.32,
        when: { resolution: '768P', duration: 10 },
      },
      {
        c: 'video_output_count',
        price: 0.33,
        when: { resolution: '1080P', duration: 6 },
      },
    ].map(({ c, price, when }) => ({
      component: c,
      unit: 'output',
      unitPriceUsd: price,
      when,
    }));
    const hailuo = {
      ...model,
      key: 'minimax/hailuo-2.3-fast',
      endpoint: 'minimax/hailuo-2.3-fast',
      defaultDuration: null,
      reviewedProviderContractVersion: 'rates-v1',
      providerInputSchema: {
        properties: {
          duration: { enum: [6, 10] },
          resolution: { enum: ['768P', '1080P'] },
        },
      },
    } as unknown as Model;
    const rateContract = (
      version: string,
      list: unknown[],
      extra: Record<string, unknown> = {},
    ) =>
      ({
        ...contract,
        conditionalDimensions: { resolution: ['768P', '1080P'] },
        endpoint: 'minimax/hailuo-2.3-fast',
        provider: 'replicate',
        pricing: {
          currency: 'USD',
          rates: list,
          source: 'provider-model-page',
          sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
          verifiedAt: '2026-01-01T00:00:00.000Z',
        },
        unitPrice: null,
        version,
        ...extra,
      }) as unknown as ModelProviderContract;

    it('needs no action on a reviewed variant model, however old its verification', () => {
      const row = projectAdminModelPricing(
        hailuo,
        [rateContract('rates-v1', rates)],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(row.attentionLevel).toBeNull();
      expect(row.attention).toEqual([]);
      expect(row.status).toBe('verified');
      expect(row.effectiveSampleCredits).toBe(64);
    });

    it('shows a model red when a variant model has no reviewed rates', () => {
      const row = projectAdminModelPricing(hailuo, [], 3.33, retrievedAt);
      expect(row.attentionLevel).toBe('red');
      expect(row.attention[0]).toMatchObject({ code: 'price_missing' });
    });

    it('shows a provider price change orange with old and new prices, still pricing the approved rate', () => {
      const changed = rates.map((rate, index) =>
        index === 0 ? { ...rate, unitPriceUsd: 0.21 } : rate,
      );
      const row = projectAdminModelPricing(
        { ...hailuo, pendingProviderContractVersion: 'rates-v2' },
        [
          rateContract('rates-v1', rates),
          rateContract('rates-v2', changed, { reviewStatus: 'pending' }),
        ],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(row.attentionLevel).toBe('orange');
      expect(row.attention).toMatchObject([{ code: 'price_change_pending' }]);
      expect(row.pendingRateChanges).toMatchObject([
        { newPriceUsd: 0.21, oldPriceUsd: 0.19 },
      ]);
      expect(row.isRateApprovalAvailable).toBe(true);
      expect(row.effectiveSampleCredits).toBe(64);
    });

    it('shows a never-reviewed model red with its parsed pending rates and an Approve action', () => {
      const unreviewed = {
        ...hailuo,
        pendingProviderContractVersion: 'rates-v2',
        reviewedProviderContractVersion: null,
      } as unknown as Model;
      const row = projectAdminModelPricing(
        unreviewed,
        [rateContract('rates-v2', rates, { reviewStatus: 'pending' })],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(row.attentionLevel).toBe('red');
      expect(row.attention[0]).toMatchObject({ code: 'price_missing' });
      expect(row.pendingRateChanges).toHaveLength(3);
      expect(row.pendingRateChanges[0]).toMatchObject({
        newPriceUsd: 0.19,
        oldPriceUsd: null,
      });
      expect(row.isRateApprovalAvailable).toBe(true);
      expect(row.reasons.join(' ')).toContain('ready to approve');
    });

    it('prices at the approved rates on the next quote after approving a never-reviewed model', async () => {
      const unreviewed = {
        ...hailuo,
        pendingProviderContractVersion: 'rates-v2',
        reviewedProviderContractVersion: null,
      } as unknown as Model;
      const pending = rateContract('rates-v2', rates, {
        reviewStatus: 'pending',
      });
      const findFirst = vi
        .fn()
        .mockResolvedValue({ ...unreviewed, providerContracts: [pending] });
      const modelUpdate = vi.fn().mockResolvedValue({ count: 1 });
      const transaction = {
        model: {
          findFirst,
          update: modelUpdate,
          updateMany: modelUpdate,
        },
        modelProviderContract: { update: vi.fn().mockResolvedValue({}) },
        platformSetting: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ marginMultiplierGeneration: 3.33 }),
        },
      };
      await new AdminModelPricingService({
        $transaction: async (
          fn: (client: typeof transaction) => Promise<unknown>,
        ) => fn(transaction),
      } as never).approveRates('model', 'user-1', 'rates-v2');
      const approvedVersion =
        modelUpdate.mock.calls[0]?.[0].data.reviewedProviderContractVersion;
      expect(approvedVersion).toBe('rates-v2');

      const profile = projectModelBillablePricingProfile(
        { ...unreviewed, reviewedProviderContractVersion: approvedVersion },
        [{ ...pending, reviewStatus: 'approved' }],
      );
      expect(
        quoteModelBillablePricing(
          profile,
          {
            modelKey: 'minimax/hailuo-2.3-fast',
            provider: 'replicate',
            selectors: { duration: 6, resolution: '768P' },
          },
          3.33,
          '2026-10-05T00:00:00Z',
        ),
      ).toMatchObject({
        snapshot: { providerCostUsd: 0.19 },
        status: 'priced',
      });
    });

    it('keeps a never-reviewed model red with the mapping failure and no Approve when rates could not be read', () => {
      const row = projectAdminModelPricing(
        {
          ...hailuo,
          providerSyncFailureCode: 'rates_unavailable:unmapped_criterion:x',
          reviewedProviderContractVersion: null,
        } as unknown as Model,
        [],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(row.attentionLevel).toBe('red');
      expect(row.isRateApprovalAvailable).toBe(false);
      expect(row.pendingRateChanges).toEqual([]);
      expect(row.reasons.join(' ')).toContain('unmapped_criterion:x');
    });

    it('does not offer approval for a schema-only pending contract', () => {
      const row = projectAdminModelPricing(
        { ...hailuo, pendingProviderContractVersion: 'rates-v2' },
        [
          rateContract('rates-v1', rates),
          rateContract('rates-v2', rates, { reviewStatus: 'pending' }),
        ],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(row.attentionLevel).toBeNull();
      expect(row.isRateApprovalAvailable).toBe(false);
    });

    it('shows a failed or stale refresh orange', () => {
      const failed = projectAdminModelPricing(
        {
          ...hailuo,
          providerSyncFailureCode: 'rates_unavailable:unmapped_criterion:x',
          providerSyncStatus: 'failed',
        } as unknown as Model,
        [rateContract('rates-v1', rates)],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(failed.attention).toMatchObject([{ code: 'refresh_failed' }]);
      const stale = projectAdminModelPricing(
        {
          ...hailuo,
          providerPricingSyncedAt: new Date('2026-09-01T00:00:00Z'),
        } as unknown as Model,
        [rateContract('rates-v1', rates)],
        3.33,
        '2026-10-05T00:00:00Z',
      );
      expect(stale.attention).toMatchObject([{ code: 'refresh_stale' }]);
    });
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
  it('reads the platform catalog inside a tenant request under the CLOUD guard', async () => {
    const delegate = buildGuardedDelegate('Model', [
      {
        ...model,
        isDeleted: false,
        organizationId: null,
        providerContracts: [],
      } as GuardedRow,
      {
        ...model,
        id: 'tenant-model',
        isDeleted: false,
        key: 'tenant/model',
        organizationId: 'org-1',
        providerContracts: [],
      } as GuardedRow,
    ]);
    const transaction = {
      model: delegate,
      platformSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const report = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      new AdminModelPricingService({
        $transaction: async (
          fn: (client: typeof transaction) => Promise<unknown>,
        ) => fn(transaction),
      } as never).getReport('https://api.example/admin/model-pricing'),
    );
    expect(report.rows.map((row) => row.key)).toEqual(['provider/model']);
  });
  it('reads only the global nondeleted catalog and policy in one repeatable-read snapshot', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ ...model, providerContracts: [] }]);
    const findFirst = vi
      .fn<
        (args: {
          where: { key: string; isDeleted: boolean };
        }) => Promise<{ marginMultiplierGeneration: number } | null>
      >()
      .mockResolvedValue(null);
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
    expect(report.marginMultiplierGeneration).toBeNull();
    findFirst.mockResolvedValue({ marginMultiplierGeneration: 3.75 });
    const configured = await new AdminModelPricingService({
      $transaction: transact,
    } as never).getReport('https://api.example/admin/model-pricing');
    expect(configured.isConversionPolicyConfigured).toBe(true);
    expect(configured.marginMultiplierGeneration).toBe(3.75);
  });

  describe('approving pending provider rates (#6196)', () => {
    const rate = (price: number) => ({
      component: 'output',
      unit: 'output',
      unitPriceUsd: price,
      when: { resolution: '768P' },
    });
    const contractOf = (version: string, price: number, status: string) =>
      ({
        ...contract,
        conditionalDimensions: {},
        endpoint: 'provider/model',
        pricing: {
          currency: 'USD',
          rates: [rate(price)],
          source: 'replicate-billing-config',
          sourceUrl: 'https://replicate.com/provider/model',
          verifiedAt: '2026-10-01T00:00:00.000Z',
        },
        provider: 'replicate',
        reviewStatus: status,
        unitPrice: null,
        version,
      }) as unknown as ModelProviderContract;
    const pendingModel = (pendingVersion: string) =>
      ({
        ...model,
        endpoint: 'provider/model',
        pendingProviderContractVersion: pendingVersion,
        providerInputSchema: {
          properties: { resolution: { enum: ['768P', '1080P'] } },
        },
        reviewedProviderContractVersion: 'rates-v1',
      }) as unknown as Model;

    function transactionFor(row: Model, contracts: ModelProviderContract[]) {
      const findFirst = vi
        .fn()
        .mockResolvedValue({ ...row, providerContracts: contracts });
      const modelUpdate = vi.fn().mockResolvedValue({ count: 1 });
      const contractUpdate = vi.fn().mockResolvedValue({});
      const transaction = {
        model: {
          findFirst,
          update: modelUpdate,
          updateMany: modelUpdate,
        },
        modelProviderContract: { update: contractUpdate },
        platformSetting: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ marginMultiplierGeneration: 3.33 }),
        },
      };
      const service = new AdminModelPricingService({
        $transaction: async (
          fn: (client: typeof transaction) => Promise<unknown>,
        ) => fn(transaction),
      } as never);
      return { contractUpdate, modelUpdate, service };
    }

    it('promotes the pending contract, recording the approver and time', async () => {
      const { contractUpdate, modelUpdate, service } = transactionFor(
        pendingModel('rates-v2'),
        [
          contractOf('rates-v1', 0.19, 'approved'),
          contractOf('rates-v2', 0.21, 'pending'),
        ],
      );

      await service.approveRates('model', 'user-1', 'rates-v2');

      expect(contractUpdate).toHaveBeenCalledWith({
        data: {
          reviewStatus: 'approved',
          reviewedAt: expect.any(Date),
          reviewedBy: 'user-1',
        },
        where: {
          provider_endpoint_version: {
            endpoint: 'provider/model',
            provider: 'replicate',
            version: 'rates-v2',
          },
        },
      });
      const update = modelUpdate.mock.calls[0]?.[0];
      expect(update.where).toEqual({
        id: 'model',
        isDeleted: false,
        organizationId: null,
        pendingProviderContractVersion: 'rates-v2',
      });
      expect(update.data).toMatchObject({
        pendingProviderContractVersion: null,
        providerSyncStatus: 'fresh',
        reviewedBy: 'user-1',
        reviewedProviderContractVersion: 'rates-v2',
      });
      // Registry fields are never touched by a rate approval.
      for (const field of [
        'isActive',
        'isDefault',
        'providerInputSchema',
        'providerCostUsd',
      ])
        expect(update.data).not.toHaveProperty(field);
    });

    it('refuses when no pending rates differ from the approved ones', async () => {
      const { modelUpdate, service } = transactionFor(
        pendingModel('rates-v2'),
        [
          contractOf('rates-v1', 0.19, 'approved'),
          contractOf('rates-v2', 0.19, 'pending'),
        ],
      );

      await expect(
        service.approveRates('model', 'user-1', 'rates-v2'),
      ).rejects.toThrow('No pending provider rates differ');
      expect(modelUpdate).not.toHaveBeenCalled();
    });

    it('refuses a stale request for rates the operator did not review', async () => {
      const { contractUpdate, modelUpdate, service } = transactionFor(
        pendingModel('rates-v3'),
        [
          contractOf('rates-v1', 0.19, 'approved'),
          contractOf('rates-v3', 0.25, 'pending'),
        ],
      );

      await expect(
        service.approveRates('model', 'user-1', 'rates-v2'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(modelUpdate).not.toHaveBeenCalled();
      expect(contractUpdate).not.toHaveBeenCalled();
    });

    it('refuses when a refresh lands between the read and the promotion', async () => {
      const { contractUpdate, modelUpdate, service } = transactionFor(
        pendingModel('rates-v2'),
        [
          contractOf('rates-v1', 0.19, 'approved'),
          contractOf('rates-v2', 0.21, 'pending'),
        ],
      );
      // The compare-and-set finds the pending pointer already moved.
      modelUpdate.mockResolvedValue({ count: 0 });

      await expect(
        service.approveRates('model', 'user-1', 'rates-v2'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(contractUpdate).not.toHaveBeenCalled();
    });

    it('reports an unknown model as not found', async () => {
      const findFirst = vi.fn().mockResolvedValue(null);
      const service = new AdminModelPricingService({
        $transaction: async (fn: (client: unknown) => Promise<unknown>) =>
          fn({
            model: { findFirst },
            platformSetting: { findFirst: vi.fn().mockResolvedValue(null) },
          }),
      } as never);

      await expect(service.approveRates('missing', 'user-1')).rejects.toThrow(
        'not found',
      );
    });
  });
});
