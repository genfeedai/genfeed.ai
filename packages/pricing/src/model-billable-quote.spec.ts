import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  allocateBillableCredits,
  quoteModelBillablePricing,
} from './model-billable-quote';

const model: ModelBillablePricingProfile = {
  key: 'provider/avatar',
  provider: 'replicate',
  isActive: true,
  isDeleted: false,
  isFree: false,
  pricingType: 'per-second',
  providerCostUsd: 0.24,
  cost: 0,
  costPerUnit: null,
  minCost: null,
  reviewedPricing: null,
  rateVersion: null,
  hasPendingRate: false,
  requiresReviewedRates: false,
};
const input: ModelBillableQuoteRequest = {
  modelKey: model.key,
  provider: model.provider,
};
const date = '2026-09-30T00:00:00Z';
describe('authoritative bill-time quote snapshots', () => {
  it('prices actual duration, aggregates once, and conserves every allocated credit', () => {
    const quote = quoteModelBillablePricing(
      model,
      { ...input, duration: 90, outputs: 3 },
      3.33,
      date,
    );
    expect(quote.status).toBe('priced');
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.providerCostUsd).toBeCloseTo(64.8);
    expect(quote.snapshot.credits).toBe(21579);
    expect(quote.snapshot.allocatedCredits.reduce((sum, n) => sum + n, 0)).toBe(
      quote.snapshot.credits,
    );
    expect(quote.snapshot.quantities.duration).toBe(90);
    expect(quote.snapshot.marginMultiplier).toBe(3.33);
    expect(quoteModelBillablePricing(model, input, 3.33, date).status).toBe(
      'unresolved',
    );
  });
  it('distinguishes provider requests from outputs without batch waivers', () => {
    const quote = quoteModelBillablePricing(
      { ...model, pricingType: 'per-request', providerCostUsd: 0.1 },
      { ...input, requests: 2, outputs: 4 },
      1,
      date,
    );
    expect(quote).toMatchObject({
      status: 'priced',
      snapshot: {
        credits: 20,
        allocationBasis: 'request',
        allocatedCredits: [10, 10],
        providerCostUsd: 0.2,
      },
    });
    expect(
      quoteModelBillablePricing(
        { ...model, pricingType: 'flat', providerCostUsd: 0.1 },
        { ...input, outputs: 4 },
        1,
        date,
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: { credits: 40, allocatedCredits: [10, 10, 10, 10] },
    });
  });
  it.each([
    { isActive: false },
    { isDeleted: true },
    { hasPendingRate: true },
    { requiresReviewedRates: true },
  ])('rejects unusable model/profile %s', (change) => {
    expect(
      quoteModelBillablePricing(
        { ...model, ...change },
        { ...input, duration: 90 },
        1,
        date,
      ).status,
    ).toBe('unresolved');
  });
  it('keeps exact dispatch identity and unknown dimensions explicit', () => {
    for (const request of [
      { ...input, modelKey: 'provider/avatar:unreviewed-version' },
      { ...input, provider: 'heygen' },
      { ...input, selectors: { resolution: '4k' } },
      { ...input, outputs: 0 },
      { ...input, requests: Infinity },
    ])
      expect(
        quoteModelBillablePricing(model, { ...request, duration: 90 }, 1, date)
          .status,
      ).toBe('unresolved');
  });
  it('preserves positive legacy flat tariffs and explicit free, without inventing vendor USD', () => {
    expect(
      quoteModelBillablePricing(
        { ...model, pricingType: 'flat', providerCostUsd: null, cost: 7 },
        { ...input, outputs: 3 },
        null,
        date,
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: {
        costSource: 'legacy-credits',
        providerCostUsd: null,
        credits: 21,
      },
    });
    expect(
      quoteModelBillablePricing(
        { ...model, pricingType: 'flat', providerCostUsd: null, cost: 0 },
        input,
        null,
        date,
      ).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        {
          ...model,
          pricingType: 'flat',
          providerCostUsd: null,
          cost: 0,
          isFree: true,
        },
        input,
        null,
        date,
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: { costSource: 'explicit-free', credits: 0, providerCostUsd: 0 },
    });
    expect(
      quoteModelBillablePricing(
        { ...model, providerCostUsd: null, costPerUnit: 2 },
        input,
        null,
        date,
      ).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        { ...model, providerCostUsd: null, costPerUnit: 2 },
        { ...input, duration: 90 },
        null,
        date,
      ),
    ).toMatchObject({ status: 'priced', snapshot: { credits: 180 } });
  });
  it('selects only an approved dated version and requested audio/resolution bands', () => {
    const reviewed = {
      ...model,
      rateVersion: 'rate-v1',
      requiresReviewedRates: true,
      reviewedPricing: {
        version: 'rate-v1',
        currency: 'USD',
        reviewStatus: 'approved',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        rates: [
          {
            component: 'output',
            unit: 'second' as const,
            unitPriceUsd: 0.3,
            isPerOutput: true,
            when: { resolution: '1080p', audio: true },
          },
          {
            component: 'output',
            unit: 'second' as const,
            unitPriceUsd: 0.1,
            isPerOutput: true,
            when: { resolution: '720p', audio: false },
          },
        ],
      },
    };
    const request = {
      ...input,
      duration: 90,
      outputs: 2,
      selectors: { resolution: '1080p', audio: true },
    };
    const quote = quoteModelBillablePricing(reviewed, request, 1, date);
    expect(quote).toMatchObject({
      status: 'priced',
      snapshot: {
        providerCostUsd: 54,
        credits: 5400,
        rateVersion: 'rate-v1',
        costSource: 'reviewed-provider',
      },
    });
    request.selectors.resolution = '4k';
    expect(quoteModelBillablePricing(reviewed, request, 1, date).status).toBe(
      'unresolved',
    );
    expect(quote).toMatchObject({
      status: 'priced',
      snapshot: { quantities: { selectors: { resolution: '1080p' } } },
    });
    expect(
      quoteModelBillablePricing(
        { ...reviewed, rateVersion: 'different' },
        request,
        1,
        date,
      ).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        reviewed,
        {
          ...input,
          duration: 90,
          selectors: { resolution: '720p', audio: false, quality: 'high' },
        },
        1,
        date,
      ).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        reviewed,
        {
          ...input,
          duration: 90,
          selectors: { resolution: '720p', audio: false },
        },
        1,
        '2026-11-01T00:00:00Z',
      ).status,
    ).toBe('unresolved');
  });
  it('allocates integer remainders deterministically without multiplying rounded quotes', () => {
    expect(allocateBillableCredits(10, 3)).toEqual([4, 3, 3]);
    expect(allocateBillableCredits(0, 3)).toEqual([0, 0, 0]);
    expect(() => allocateBillableCredits(1, 0)).toThrow(RangeError);
  });
});
