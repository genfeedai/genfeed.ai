import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  allocateBillableCredits,
  hasPendingProviderRateDrift,
  quoteModelBillableCompletion,
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
  requiredSelectorKeys: [],
};
const input: ModelBillableQuoteRequest = {
  modelKey: model.key,
  provider: model.provider,
};
const date = '2026-09-30T00:00:00Z';
describe('pending provider rate drift', () => {
  it.each([
    ['rate-v1', 'rate-v2', true],
    ['rate-v1', 'rate-v1', false],
    ['rate-v1', null, false],
    [null, 'sync-v1', false],
    [undefined, undefined, false],
  ] as const)('reviewed %s, pending %s → %s', (reviewed, pending, expected) => {
    expect(hasPendingProviderRateDrift(reviewed, pending)).toBe(expected);
  });
});
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
  it('rejects nonzero provider costs below supported precision', () => {
    expect(
      quoteModelBillablePricing(
        { ...model, providerCostUsd: 1e-200 },
        { ...input, duration: 1e-200 },
        1,
        date,
      ).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        { ...model, pricingType: 'per-megapixel', providerCostUsd: 0.1 },
        { ...input, width: 1e-200, height: 1e-200 },
        1,
        date,
      ).status,
    ).toBe('unresolved');
  });
  it('preserves exact decimal quantities in legacy metered credits', () => {
    expect(
      quoteModelBillablePricing(
        { ...model, providerCostUsd: null, costPerUnit: 100 },
        { ...input, duration: 0.07 },
        null,
        date,
      ),
    ).toMatchObject({ status: 'priced', snapshot: { credits: 7 } });
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
  it('allocates using only applicable bands and demands schema pricing selectors', () => {
    const reviewed = {
      ...model,
      rateVersion: 'v1',
      requiredSelectorKeys: ['mode'],
      reviewedPricing: {
        version: 'v1',
        currency: 'USD',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        reviewStatus: 'approved',
        rates: [
          {
            component: 'output',
            unit: 'request' as const,
            unitPriceUsd: 0.1,
            when: { mode: 'request' },
          },
          {
            component: 'output',
            unit: 'output' as const,
            unitPriceUsd: 0.2,
            when: { mode: 'output' },
          },
        ],
      },
    };
    expect(
      quoteModelBillablePricing(
        reviewed,
        { ...input, requests: 2, outputs: 4, selectors: { mode: 'request' } },
        1,
        date,
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: { allocationBasis: 'request', allocatedCredits: [10, 10] },
    });
    expect(
      quoteModelBillablePricing(
        reviewed,
        { ...input, requests: 2, outputs: 4 },
        1,
        date,
      ).status,
    ).toBe('unresolved');
  });
  it('preserves admission selector applicability when only an unconditional rate matches', () => {
    const profile: ModelBillablePricingProfile = {
      ...model,
      rateVersion: 'v1',
      requiredSelectorKeys: ['mode'],
      reviewedPricing: {
        version: 'v1',
        currency: 'USD',
        reviewStatus: 'approved',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        invariantSelectors: ['resolution'],
        rates: [
          {
            component: 'output',
            unit: 'output' as const,
            unitPriceUsd: 0.1,
            when: {},
          },
          {
            component: 'output',
            unit: 'output' as const,
            unitPriceUsd: 0.2,
            when: { mode: 'pro' },
          },
        ],
      },
    };
    expect(quoteModelBillablePricing(profile, input, 1, date).status).toBe(
      'unresolved',
    );
    const quote = quoteModelBillablePricing(
      profile,
      {
        ...input,
        outputs: 2,
        selectors: { mode: 'standard', resolution: '720p' },
      },
      1,
      date,
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.pricingProfile.reviewedPricing?.rates).toHaveLength(
      1,
    );
    expect(
      quote.snapshot.pricingProfile.reviewedPricing?.invariantSelectors,
    ).toEqual(['resolution', 'mode']);
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 2,
        successfulRequests: 1,
      }),
    ).toEqual({ status: 'priced', credits: 20, billableProviderCostUsd: 0.2 });
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
      }),
    ).toEqual({ status: 'priced', credits: 10, billableProviderCostUsd: 0.1 });
    const changedSelectors: NonNullable<
      ModelBillableQuoteRequest['selectors']
    >[] = [
      { mode: 'pro', resolution: '720p' },
      { mode: 'standard' },
      { mode: 'standard', resolution: '720p', quality: 'high' },
      {},
    ];
    for (const selectors of changedSelectors) {
      expect(
        quoteModelBillableCompletion(quote.snapshot, {
          completedOutputs: 2,
          successfulRequests: 1,
          selectors,
        }),
      ).toEqual({
        status: 'unresolved',
        reason: 'Completion selectors differ from the admitted variant',
      });
    }
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 2,
        successfulRequests: 1,
        selectors: { resolution: '720p', mode: 'standard' },
      }),
    ).toEqual({ status: 'priced', credits: 20, billableProviderCostUsd: 0.2 });
  });
  it('rejects zero aggregate paid usage at admission and completed usage without changing empty completion', () => {
    const profile: ModelBillablePricingProfile = {
      ...model,
      rateVersion: 'v1',
      reviewedPricing: {
        version: 'v1',
        currency: 'USD',
        reviewStatus: 'approved',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        rates: [
          {
            component: 'input',
            unit: 'input-token' as const,
            unitPriceUsd: 0.001,
            when: {},
          },
        ],
      },
    };
    expect(
      quoteModelBillablePricing(profile, { ...input, inputTokens: 0 }, 1, date)
        .status,
    ).toBe('unresolved');
    const quote = quoteModelBillablePricing(
      profile,
      { ...input, inputTokens: 100 },
      1,
      date,
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
        inputTokens: 0,
      }).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 0,
        successfulRequests: 0,
      }),
    ).toEqual({ status: 'priced', credits: 0, billableProviderCostUsd: 0 });
  });
  it('allocates integer remainders deterministically without multiplying rounded quotes', () => {
    expect(allocateBillableCredits(10, 3)).toEqual([4, 3, 3]);
    expect(allocateBillableCredits(0, 3)).toEqual([0, 0, 0]);
    expect(() => allocateBillableCredits(1, 0)).toThrow(RangeError);
  });
  it('native request and mixed component completion ignores failed output positions', () => {
    const profile = {
      ...model,
      rateVersion: 'mixed-v1',
      requestCompletionPolicy: 'successful-request' as const,
      reviewedPricing: {
        version: 'mixed-v1',
        currency: 'USD',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        reviewStatus: 'approved',
        rates: [
          {
            component: 'request',
            unit: 'request' as const,
            unitPriceUsd: 0.1,
            when: {},
          },
          {
            component: 'outputs',
            unit: 'output' as const,
            unitPriceUsd: 0.033,
            when: {},
          },
        ],
      },
    };
    const quote = quoteModelBillablePricing(
      profile,
      { ...input, outputs: 3 },
      1,
      date,
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(quote.snapshot.credits).toBe(20);
    expect(quote.snapshot.allocatedCredits).toEqual([7, 7, 6]);
    expect(
      quoteModelBillableCompletion(
        {
          ...quote.snapshot,
          pricingProfile: {
            ...quote.snapshot.pricingProfile,
            requestCompletionPolicy: undefined,
          },
        },
        { completedOutputs: 2, successfulRequests: 1 },
      ).status,
    ).toBe('unresolved');
    for (const completedPositions of [
      [0, 1],
      [1, 2],
      [2, 0],
    ]) {
      expect(
        quoteModelBillableCompletion(quote.snapshot, {
          completedOutputs: completedPositions.length,
          successfulRequests: 1,
        }),
      ).toEqual({
        status: 'priced',
        credits: 17,
        billableProviderCostUsd: 0.166,
      });
    }
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 0,
        successfulRequests: 0,
      }),
    ).toMatchObject({ status: 'priced', credits: 0 });
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 0,
        successfulRequests: 1,
      }).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 4,
        successfulRequests: 1,
      }).status,
    ).toBe('unresolved');
    const request = quoteModelBillablePricing(
      {
        ...model,
        pricingType: 'per-request',
        providerCostUsd: 0.1,
        requestCompletionPolicy: 'successful-request',
      },
      { ...input, outputs: 3 },
      1,
      date,
    );
    if (request.status !== 'priced') throw new Error(request.reason);
    expect(
      quoteModelBillableCompletion(request.snapshot, {
        completedOutputs: 2,
        successfulRequests: 1,
      }),
    ).toEqual({ status: 'priced', credits: 10, billableProviderCostUsd: 0.1 });
  });
  it('requires frozen request policy even when all outputs complete', () => {
    const quote = quoteModelBillablePricing(
      { ...model, pricingType: 'per-request', providerCostUsd: 0.1 },
      { ...input, outputs: 2, requests: 2 },
      1,
      date,
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 2,
        successfulRequests: 1,
      }).status,
    ).toBe('unresolved');
  });
  it('keeps rate/margin evidence immutable and refuses invented partial input usage', () => {
    const profile = {
      ...model,
      rateVersion: 'v1',
      requestCompletionPolicy: 'successful-request' as const,
      reviewedPricing: {
        version: 'v1',
        currency: 'USD',
        sourceUrl: 'https://replicate.com/provider/avatar',
        verifiedAt: date,
        reviewStatus: 'approved',
        rates: [
          {
            component: 'request',
            unit: 'request' as const,
            unitPriceUsd: 0.1,
            when: {},
          },
          {
            component: 'references',
            unit: 'reference' as const,
            unitPriceUsd: 0.01,
            when: {},
          },
        ],
      },
    };
    const quote = quoteModelBillablePricing(
      profile,
      { ...input, outputs: 2, requests: 2, references: 4 },
      1,
      date,
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    profile.reviewedPricing.rates[0].unitPriceUsd = 99;
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
      }).status,
    ).toBe('unresolved');
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
        references: 2,
      }),
    ).toEqual({
      status: 'priced',
      credits: 12,
      billableProviderCostUsd: 0.12,
    });
    expect(quote.snapshot.marginMultiplier).toBe(1);
  });
});
