import { describe, expect, it } from 'vitest';
import { quoteModelBillablePricing } from './model-billable-quote';

const key = 'ideogram-ai/ideogram-4-5';
describe('image editing per-output funding', () => {
  it('quotes eight edited images as eight outputs in one request and conserves settlement credits', () => {
    const quote = quoteModelBillablePricing(
      {
        key,
        provider: 'replicate',
        isActive: true,
        isDeleted: false,
        isFree: false,
        cost: 20,
        providerCostUsd: 0.06,
        costPerUnit: null,
        minCost: null,
        pricingType: 'flat',
        reviewedPricing: null,
        rateVersion: null,
        requiresReviewedRates: false,
        requiredSelectorKeys: [],
        hasPendingRate: false,
      },
      {
        modelKey: key,
        provider: 'replicate',
        outputs: 8,
        requests: 1,
      },
      3.33,
      '2026-10-01T01:00:00.000Z',
    );
    expect(quote.status).toBe('priced');
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.providerCostUsd).toBe(0.48);
    expect(quote.snapshot.credits).toBe(160);
    expect(quote.snapshot.allocatedCredits).toEqual(Array(8).fill(20));
  });
});
