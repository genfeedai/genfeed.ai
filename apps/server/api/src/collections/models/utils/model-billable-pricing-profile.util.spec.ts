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
  describe('never-reviewed Replicate rows after the weekly contract sync', () => {
    // Shape of the prod `google/nano-banana-2-lite` row on 2026-10-04: the
    // catalog seed priced it (providerCostUsd 0.034, cost 12) and the Sunday
    // 06:00 UTC model-watcher parked a first contract as pending without ever
    // reviewing one (`ReplicateModelContractSyncService.synchronizeModel`).
    const neverReviewed = {
      ...model,
      key: 'google/nano-banana-2-lite',
      endpoint: 'google/nano-banana-2-lite',
      provider: 'replicate',
      pricingType: null,
      providerCostUsd: 0.034,
      cost: 12,
      costPerUnit: null,
      hasResolutionOptions: false,
      reviewedProviderContractVersion: null,
      pendingProviderContractVersion: 'sha256-first-sync',
    } as unknown as Model;
    const quote = (
      profile: ReturnType<typeof projectModelBillablePricingProfile>,
    ) =>
      quoteModelBillablePricing(
        profile,
        {
          modelKey: 'google/nano-banana-2-lite',
          provider: 'replicate',
          width: 1024,
          height: 1024,
        },
        3,
        '2026-10-04T19:03:17.000Z',
      );

    it('does not treat a first-sync pending contract as drift', () => {
      const profile = projectModelBillablePricingProfile(neverReviewed, []);
      expect(profile.hasPendingRate).toBe(false);
      expect(profile.requiresReviewedRates).toBe(false);
    });

    it('quotes the configured provider cost instead of PRICING_UNAVAILABLE', () => {
      const result = quote(
        projectModelBillablePricingProfile(neverReviewed, []),
      );
      expect(result).toMatchObject({
        status: 'priced',
        snapshot: { costSource: 'configured-provider', providerCostUsd: 0.034 },
      });
    });

    it('still refuses a reviewed row whose provider contract drifted', () => {
      const result = quote(
        projectModelBillablePricingProfile(
          {
            ...neverReviewed,
            reviewedProviderContractVersion: 'reviewed-v1',
            pendingProviderContractVersion: 'sha256-drifted',
          },
          [],
        ),
      );
      expect(result).toEqual({
        status: 'unresolved',
        reason: 'Pending provider rate requires review',
      });
    });
  });
});
