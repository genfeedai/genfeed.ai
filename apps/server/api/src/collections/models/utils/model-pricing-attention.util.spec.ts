import {
  classifyModelRowPricingAttention,
  findUnpriceableModelIds,
} from '@api/collections/models/utils/model-pricing-attention.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelLifecycle } from '@genfeedai/contracts';
import type { Model } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

/** An active Replicate row the provider stopped serving: no price at all. */
function unpricedRow(lifecycle: ModelLifecycle): Model {
  return {
    category: 'video',
    cost: 0,
    costPerUnit: null,
    defaultDuration: 5,
    endpoint: 'kwaivgi/kling-v1.6-pro',
    hasAudioToggle: null,
    hasResolutionOptions: null,
    inputCostPerMillionTokens: null,
    isActive: true,
    isDeleted: false,
    isFree: false,
    key: 'kwaivgi/kling-v1.6-pro',
    lifecycle,
    minCost: null,
    outputCostPerMillionTokens: null,
    pendingProviderContractVersion: null,
    pricingType: null,
    provider: 'replicate',
    providerCostUsd: null,
    providerInputSchema: null,
    providerPricingSyncedAt: null,
    providerSyncFailureCode: null,
    providerSyncStatus: null,
    reviewedProviderContractVersion: null,
  } as unknown as Model;
}

describe('classifyModelRowPricingAttention', () => {
  it('flags an unpriced offered row red', () => {
    expect(
      classifyModelRowPricingAttention(
        unpricedRow(ModelLifecycle.AVAILABLE),
        [],
        3.33,
        new Date('2026-10-15T00:00:00Z'),
      ),
    ).toEqual([
      expect.objectContaining({ code: 'price_missing', level: 'red' }),
    ]);
  });

  it('keeps an unpriced legacy row red: legacy rows are still offered', () => {
    expect(
      classifyModelRowPricingAttention(
        unpricedRow(ModelLifecycle.LEGACY),
        [],
        3.33,
        new Date('2026-10-15T00:00:00Z'),
      ),
    ).toEqual([expect.objectContaining({ level: 'red' })]);
  });

  it('never flags a retired row, which bills through its successor', () => {
    expect(
      classifyModelRowPricingAttention(
        unpricedRow(ModelLifecycle.RETIRED),
        [],
        3.33,
        new Date('2026-10-15T00:00:00Z'),
      ),
    ).toEqual([]);
  });
});

describe('findUnpriceableModelIds', () => {
  function build(rows: Model[]) {
    const modelFindMany = vi.fn().mockResolvedValue(rows);
    const contractFindMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      model: { findMany: modelFindMany },
      modelProviderContract: { findMany: contractFindMany },
    } as unknown as PrismaService;
    return { contractFindMany, modelFindMany, prisma };
  }

  it('returns the unpriced rows without joining contract history onto the catalog', async () => {
    const red = { ...unpricedRow(ModelLifecycle.AVAILABLE), id: 'red' };
    const retired = { ...unpricedRow(ModelLifecycle.RETIRED), id: 'retired' };
    const { modelFindMany, prisma } = build([red, retired]);

    await expect(findUnpriceableModelIds(prisma, {})).resolves.toEqual(['red']);
    expect(modelFindMany.mock.calls[0][0].select).not.toHaveProperty(
      'providerContracts',
    );
  });

  it('loads only the reviewed contract version, not the version history', async () => {
    const reviewed = {
      ...unpricedRow(ModelLifecycle.AVAILABLE),
      id: 'reviewed',
      reviewedProviderContractVersion: 'rate-v7',
    };
    const { contractFindMany, prisma } = build([reviewed]);

    await findUnpriceableModelIds(prisma, {});

    expect(contractFindMany).toHaveBeenCalledOnce();
    expect(contractFindMany.mock.calls[0][0].where).toEqual({
      modelId: { in: ['reviewed'] },
      version: { in: ['rate-v7'] },
    });
  });

  it('skips the contract query when no model carries a contract version', async () => {
    const { contractFindMany, prisma } = build([
      { ...unpricedRow(ModelLifecycle.AVAILABLE), id: 'plain' },
    ]);

    await findUnpriceableModelIds(prisma, {});

    expect(contractFindMany).not.toHaveBeenCalled();
  });
});
