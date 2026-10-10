import { projectModelBillablePricingProfile } from '@api/collections/models/utils/model-billable-pricing-profile.util';
import {
  classifyModelPricingAttention,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';
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
  it('cannot treat a lost conditional contract as a scalar or free tariff', () => {
    const profile = projectModelBillablePricingProfile(
      {
        ...model,
        pricingType: 'conditional',
        providerCostUsd: null,
        cost: 0,
        costPerUnit: null,
        hasResolutionOptions: false,
        hasAudioToggle: false,
      },
      [],
    );
    expect(profile.reviewedPricing).toBeNull();
    expect(profile.requiresReviewedRates).toBe(true);
    for (const isFree of [false, true]) {
      expect(
        quoteModelBillablePricing(
          { ...profile, isFree },
          { modelKey: model.key, provider: model.provider, duration: 5 },
          3.33,
          '2026-10-10T00:00:00Z',
        ).status,
      ).toBe('unresolved');
    }
  });

  it('keeps Seedance callable when legacy audio flags lack a schema field', () => {
    const seedance = {
      ...model,
      key: 'bytedance/seedance-2.5',
      endpoint: 'bytedance/seedance-2.5',
      provider: 'replicate',
      hasAudioToggle: true,
    };
    const profile = projectModelBillablePricingProfile(seedance, [
      {
        ...contract,
        provider: seedance.provider,
        endpoint: seedance.endpoint,
        pricing: {
          currency: 'USD',
          sourceUrl: 'https://replicate.com/bytedance/seedance-2.5',
          verifiedAt: '2026-10-09T06:00:01.069Z',
          invariantSelectors: ['generate_audio'],
          rates: [
            {
              component: 'output',
              unit: 'second',
              unitPriceUsd: 0.2312,
              isPerOutput: true,
              when: { resolution: '720p', model_variant: 'non_video_in' },
            },
          ],
          variantRules: [
            {
              selectorKey: 'model_variant',
              criterionTitle: 'model variant',
              derive: {
                kind: 'presence',
                field: 'reference_videos',
                fieldType: 'array',
                whenPresent: 'video_in',
                whenAbsent: 'non_video_in',
              },
            },
          ],
        },
      },
    ]);
    expect(profile.requiredSelectorKeys).toEqual([
      'resolution',
      'generate_audio',
      'model_variant',
    ]);
    const quote = quoteModelBillablePricing(
      profile,
      {
        modelKey: seedance.key,
        provider: seedance.provider,
        duration: 5,
        selectors: { resolution: '720p' },
      },
      3.33,
      '2026-10-10T00:00:00Z',
      { kind: 'dispatch', input: { resolution: '720p', reference_videos: [] } },
    );
    expect(quote).toMatchObject({
      status: 'priced',
      snapshot: { providerCostUsd: 1.156 },
    });
    expect(
      classifyModelPricingAttention({
        category: 'video',
        isActive: true,
        isFree: false,
        now: new Date('2026-10-10T00:00:00Z'),
        profile,
        provider: seedance.provider,
      }),
    ).toEqual([]);
  });

  it('does not rename an actual schema audio field to an unrelated invariant', () => {
    const profile = projectModelBillablePricingProfile(
      {
        ...model,
        hasAudioToggle: true,
        providerInputSchema: { properties: { audio: { type: 'boolean' } } },
      },
      [
        {
          ...contract,
          pricing: {
            currency: 'USD',
            sourceUrl: 'https://fal.ai/models/fal-ai/model',
            verifiedAt: '2026-09-30T00:00:00Z',
            invariantSelectors: ['generate_audio'],
            rates: [
              {
                component: 'output',
                unit: 'second',
                unitPriceUsd: 0.2,
                when: {},
              },
            ],
          },
        },
      ],
    );
    expect(profile.requiredSelectorKeys).toContain('audio');
    expect(
      quoteModelBillablePricing(
        profile,
        { modelKey: model.key, provider: model.provider, duration: 5 },
        3.33,
        '2026-10-10T00:00:00Z',
      ).status,
    ).toBe('unresolved');
  });

  it('requires an explicit audio choice when approved rates price that choice', () => {
    const profile = projectModelBillablePricingProfile(
      { ...model, hasAudioToggle: true, hasResolutionOptions: false },
      [
        {
          ...contract,
          pricing: {
            currency: 'USD',
            sourceUrl: 'https://fal.ai/models/fal-ai/model',
            verifiedAt: '2026-09-30T00:00:00Z',
            rates: [
              {
                component: 'output',
                unit: 'second',
                unitPriceUsd: 0.2,
                when: { generate_audio: false },
              },
              {
                component: 'output',
                unit: 'second',
                unitPriceUsd: 0.4,
                when: { generate_audio: true },
              },
            ],
          },
        },
      ],
    );
    expect(profile.requiredSelectorKeys).toEqual(['generate_audio']);
    const request = {
      modelKey: model.key,
      provider: model.provider,
      duration: 5,
    };
    expect(
      quoteModelBillablePricing(profile, request, 3.33, '2026-10-10T00:00:00Z')
        .status,
    ).toBe('unresolved');
    expect(
      quoteModelBillablePricing(
        profile,
        { ...request, selectors: { generate_audio: false } },
        3.33,
        '2026-10-10T00:00:00Z',
      ),
    ).toMatchObject({ status: 'priced', snapshot: { providerCostUsd: 1 } });
  });

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
