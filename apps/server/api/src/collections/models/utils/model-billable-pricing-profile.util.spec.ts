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
  discoveredAt: new Date('2026-08-01T00:00:00Z'),
  lastSeenAt: new Date('2026-09-30T00:00:00Z'),
} as unknown as ModelProviderContract;
describe('raw reviewed provider pricing adapter', () => {
  it('adapts exact approved Fal account evidence, dated by the last observation of these exact rates', () => {
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
  it('keeps unpriced selectable dimensions explicit when a pending contract is unreadable', () => {
    const profile = projectModelBillablePricingProfile(
      { ...model, pendingProviderContractVersion: 'rate-v2' },
      [],
    );
    expect(profile.hasPendingRate).toBe(false);
    expect(profile.requiresReviewedRates).toBe(true);
    expect(profile.reviewedPricing).toBeNull();
  });
  it('does not call a schema-only pending contract a price change', () => {
    const profile = projectModelBillablePricingProfile(
      { ...model, pendingProviderContractVersion: 'schema-v2' },
      [
        contract,
        {
          ...contract,
          version: 'schema-v2',
          reviewStatus: 'pending',
          lastSeenAt: new Date('2026-10-04T00:00:00Z'),
        },
      ],
    );
    expect(profile.hasPendingRate).toBe(false);
    expect(profile.reviewedPricing?.rates[0]?.unitPriceUsd).toBe(0.2);
  });
  it('flags a changed provider price as pending and keeps charging the reviewed rate', () => {
    const profile = projectModelBillablePricingProfile(
      { ...model, pendingProviderContractVersion: 'price-v2' },
      [
        contract,
        {
          ...contract,
          version: 'price-v2',
          reviewStatus: 'pending',
          pricing: [
            {
              currency: 'USD',
              unit: 'second',
              unitPrice: '0.3',
              endpoint: 'fal-ai/model',
              conditionalDimensions: { resolution: '720p' },
            },
          ],
        },
      ],
    );
    expect(profile.hasPendingRate).toBe(true);
    expect(profile.reviewedPricing?.rates[0]?.unitPriceUsd).toBe(0.2);
    expect(
      quoteModelBillablePricing(
        profile,
        {
          modelKey: 'fal/model',
          provider: 'fal',
          duration: 5,
          selectors: { resolution: '720p' },
        },
        1,
        '2026-12-30T00:00:00Z',
      ),
    ).toMatchObject({ status: 'priced', snapshot: { providerCostUsd: 1 } });
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

describe('pending reviewed variant drift', () => {
  it.each(['base', 'interpolate'])(
    'compares frozen defaults (%s) while retaining approved pricing',
    (pendingDefault) => {
      const pricingFor = (defaultValue: string) => ({
        currency: 'USD',
        sourceUrl: 'https://replicate.com/test/model',
        verifiedAt: '2026-10-05T00:00:00Z',
        rates: [
          {
            component: 'output',
            unit: 'output',
            unitPriceUsd: 0.11,
            when: { model_variant: 'base' },
          },
        ],
        variantRules: [
          {
            selectorKey: 'model_variant',
            criterionTitle: 'model variant',
            derive: {
              kind: 'field',
              field: 'mode',
              fieldType: 'string',
              default: defaultValue,
              valueMap: { base: 'base', interpolate: 'interpolate' },
            },
          },
        ],
      });
      const reviewed = {
        ...contract,
        provider: 'replicate',
        endpoint: 'test/model',
        pricing: pricingFor('base'),
      };
      const profile = projectModelBillablePricingProfile(
        {
          ...model,
          key: 'test/model',
          provider: 'replicate',
          endpoint: 'test/model',
          pendingProviderContractVersion: 'rule-v2',
        },
        [
          reviewed,
          {
            ...reviewed,
            version: 'rule-v2',
            reviewStatus: 'pending',
            pricing: pricingFor(pendingDefault),
          },
        ],
      );
      expect(profile.hasPendingRate).toBe(pendingDefault !== 'base');
      expect(profile.reviewedPricing?.variantRules?.[0]?.derive).toMatchObject({
        default: 'base',
      });
      expect(profile.rateVersion).toBe('rate-v1');
    },
  );
});
