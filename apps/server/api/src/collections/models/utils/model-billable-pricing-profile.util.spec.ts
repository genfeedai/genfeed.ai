import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import { quoteModelBillablePricing } from '@genfeedai/pricing';
import type { Model, ModelProviderContract } from '@genfeedai/prisma';
import { describe, expect, it } from 'vitest';

const model = {
  key: 'fal/model',
  endpoint: 'fal-ai/model',
  provider: 'fal',
  isActive: true,
  isDeleted: false,
  isFree: false,
  pricingType: 'per-second',
  providerCostUsd: 0.2,
  cost: 99,
  costPerUnit: 20,
  minCost: null,
  hasResolutionOptions: true,
  hasAudioToggle: false,
  providerInputSchema: null,
  reviewedProviderContractVersion: 'rate-v1',
  pendingProviderContractVersion: null,
} as unknown as Model;
const contract = {
  provider: 'fal',
  endpoint: 'fal-ai/model',
  version: 'rate-v1',
  reviewStatus: 'approved',
  mappingStatus: 'supported',
  pricing: [
    {
      currency: 'USD',
      unit: 'second',
      unitPrice: '0.2',
      endpoint: 'fal-ai/model',
      conditionalDimensions: { resolution: '720p' },
    },
  ],
  conditionalDimensions: { resolution: '720p' },
  discoveredAt: new Date('2026-09-30T00:00:00Z'),
} as unknown as ModelProviderContract;
describe('raw reviewed provider pricing adapter', () => {
  it('adapts exact approved Fal account evidence using immutable discovery date, not refreshed observation', () => {
    const profile = projectModelBillablePricingProfile(model, [contract]);
    expect(profile.cost).toBe(99);
    expect(profile.requiresReviewedRates).toBe(true);
    expect(profile.reviewedPricing).toMatchObject({
      version: 'rate-v1',
      verifiedAt: '2026-09-30T00:00:00.000Z',
      rates: [
        {
          unit: 'second',
          unitPriceUsd: 0.2,
          when: { resolution: '720p' },
          isPerOutput: true,
        },
      ],
    });
  });
  it.each([
    { reviewStatus: 'pending' },
    { mappingStatus: 'quarantined' },
    { provider: 'replicate' },
    { endpoint: 'different' },
    { version: 'different' },
    {
      pricing: [
        {
          currency: 'EUR',
          unit: 'second',
          unitPrice: '0.2',
          endpoint: 'fal-ai/model',
          conditionalDimensions: {},
        },
      ],
    },
  ])('rejects mismatched/unapproved/unsupported contract %s', (change) => {
    expect(
      projectModelBillablePricingProfile(model, [{ ...contract, ...change }])
        .reviewedPricing,
    ).toBeNull();
  });
  it('requires schema selectors even when legacy capability flags are absent', () => {
    const profile = projectModelBillablePricingProfile(
      {
        ...model,
        hasResolutionOptions: false,
        hasAudioToggle: false,
        providerInputSchema: {
          properties: {
            resolution: { enum: ['720p', '1080p'] },
            generate_audio: { type: 'boolean' },
            mode: { enum: ['standard', 'pro'] },
          },
        },
      },
      [],
    );
    expect(profile.requiresReviewedRates).toBe(true);
    expect(profile.requiredSelectorKeys).toEqual([
      'resolution',
      'mode',
      'generate_audio',
    ]);
  });
  it('keeps pending drift and unpriced selectable dimensions explicit', () => {
    const profile = projectModelBillablePricingProfile(
      { ...model, pendingProviderContractVersion: 'rate-v2' },
      [],
    );
    expect(profile.hasPendingRate).toBe(true);
    expect(profile.requiresReviewedRates).toBe(true);
    expect(profile.reviewedPricing).toBeNull();
  });
  it('prices a never-reviewed model from its configured row despite a synced pending candidate', () => {
    // Production shape: the Replicate watcher stamps a pending contract on
    // every active model it observes, including ones never reviewed.
    const profile = projectModelBillablePricingProfile(
      {
        ...model,
        key: 'google/nano-banana-2-lite',
        endpoint: 'google/nano-banana-2-lite',
        provider: 'replicate',
        pricingType: 'flat',
        providerCostUsd: 0.034,
        cost: 12,
        hasResolutionOptions: false,
        reviewedProviderContractVersion: null,
        pendingProviderContractVersion: 'sync-v1',
      },
      [],
    );
    expect(profile.hasPendingRate).toBe(false);
    expect(
      quoteModelBillablePricing(
        profile,
        { modelKey: 'google/nano-banana-2-lite', provider: 'replicate' },
        3.33,
        '2026-10-04T19:03:18Z',
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: { costSource: 'configured-provider' },
    });
  });
  it('does not promote Replicate curated prices into financially verified bands', () => {
    const replicate = { ...model, provider: 'replicate' };
    expect(
      projectModelBillablePricingProfile(replicate, [
        {
          ...contract,
          provider: 'replicate',
          pricing: [
            { currency: 'USD', source: 'curated-known-cost', unitPrice: '0.2' },
          ],
        },
      ]).reviewedPricing,
    ).toBeNull();
  });
});
