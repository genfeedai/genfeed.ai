import { classifyModelRowPricingAttention } from '@api/collections/models/utils/model-pricing-attention.util';
import { ModelLifecycle } from '@genfeedai/contracts';
import type { Model } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

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
