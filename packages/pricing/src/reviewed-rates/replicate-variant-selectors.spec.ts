import type {
  ModelBillablePricingProfile,
  ModelBillableQuoteRequest,
  ReviewedVariantRule,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  quoteModelBillableCompletion,
  quoteModelBillablePricing,
} from '../model-billable-quote';
import { applyMargin } from '../plans-pricing';
import { hashReviewedProviderRates } from '../reviewed-rate-hash';
import { mapReplicateBillingTiers } from './replicate-billing-tiers';
import { REPLICATE_VARIANT_SELECTORS } from './replicate-variant-selectors';
import { REPLICATE_VARIANT_FIXTURES } from './replicate-variants.fixture';
import { hashReviewedRateSheetEntry } from './reviewed-rate-sheet-hash';
import { parseReviewedVariantRules } from './variant-rule-validation';
import { resolveVariantSelectors } from './variant-selectors';

function mapped(endpoint: string) {
  const fixture = REPLICATE_VARIANT_FIXTURES[endpoint];
  if (!fixture) throw new Error(`Missing evidence ${endpoint}`);
  const result = mapReplicateBillingTiers(
    fixture.tiers,
    fixture.inputProperties,
    endpoint,
  );
  if (result.status !== 'ok') throw new Error(result.reason);
  return result;
}
function profile(endpoint: string): ModelBillablePricingProfile {
  const mapping = mapped(endpoint);
  return {
    key: endpoint,
    provider: 'replicate',
    isActive: true,
    isDeleted: false,
    isFree: false,
    pricingType: 'conditional',
    providerCostUsd: null,
    cost: 0,
    costPerUnit: null,
    minCost: null,
    rateVersion: 'v1',
    requiresReviewedRates: true,
    hasPendingRate: false,
    requiredSelectorKeys: mapping.selectorKeys,
    reviewedPricing: {
      version: 'v1',
      currency: 'USD',
      sourceUrl: `https://replicate.com/${endpoint}`,
      verifiedAt: '2026-10-05T00:00:00Z',
      reviewStatus: 'approved',
      rates: mapping.rates,
      variantRules: mapping.variantRules,
    },
  };
}
function rules(endpoint = 'openai/gpt-image-2'): ReviewedVariantRule[] {
  return mapped(endpoint).variantRules ?? [];
}
const date = '2026-10-05T00:00:00Z';

describe('checked-in Replicate variant selectors', () => {
  it('prices FLUX 3 draft and continuation independently of audio', () => {
    const { rates, variantRules } = mapped('black-forest-labs/flux-3');
    expect(rates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit: 'second',
          unitPriceUsd: 0.17,
          when: { model_variant: 't2v_i2v', resolution: '720p' },
        }),
        expect.objectContaining({
          unit: 'second',
          unitPriceUsd: 0.06,
          when: { model_variant: 't2v_i2v_draft', resolution: '720p' },
        }),
        expect.objectContaining({
          unit: 'second',
          unitPriceUsd: 0.53,
          when: { model_variant: 'v2v', resolution: '1080p' },
        }),
        expect.objectContaining({
          unit: 'second',
          unitPriceUsd: 0.12,
          when: { model_variant: 'v2v_draft', resolution: '720p' },
        }),
      ]),
    );
    expect(variantRules?.[0]?.derive).toMatchObject({
      kind: 'composite',
      parts: [
        { field: 'start_video', mode: 'presence' },
        { field: 'draft', mode: 'value', default: false },
      ],
    });
  });
  it.each(Object.keys(REPLICATE_VARIANT_SELECTORS))(
    'maps all captured tiers for %s',
    (endpoint) => {
      const result = mapped(endpoint);
      const selectors = REPLICATE_VARIANT_SELECTORS[endpoint];
      expect(result.variantRules).toHaveLength(selectors?.length ?? 0);
      expect(
        result.variantRules?.map((rule) => rule.selectorKey).sort(),
      ).toEqual(selectors?.map((rule) => rule.selectorKey).sort());
      expect(result.rates.length).toBeGreaterThan(0);
    },
  );
  it('keeps Seedance resolution direct while Pixverse derives it from quality', () => {
    expect(mapped('bytedance/seedance-2.5').selectorKeys).toEqual([
      'model_variant',
      'resolution',
    ]);
    expect(mapped('pixverse/pixverse-v6').selectorKeys).toEqual([
      'target_resolution',
      'with_audio',
    ]);
  });
  it('fails closed for an unknown endpoint, tier label or changed schema', () => {
    const fixture = REPLICATE_VARIANT_FIXTURES['openai/gpt-image-2'];
    if (!fixture) throw new Error('missing fixture');
    expect(
      mapReplicateBillingTiers(
        fixture.tiers,
        fixture.inputProperties,
        'unknown/model',
      ),
    ).toEqual({
      status: 'failed',
      reason: 'model variant needs a resolver entry',
    });
    const tiers = [
      {
        criteria: [
          { title: 'model variant', subtype: 'string', value: 'future' },
        ],
        prices: [{ metric: 'image_output_count', price: '$1' }],
      },
    ];
    expect(
      mapReplicateBillingTiers(
        tiers,
        fixture.inputProperties,
        'openai/gpt-image-2',
      ),
    ).toEqual({
      status: 'failed',
      reason: 'model variant needs a resolver entry',
    });
    expect(
      mapReplicateBillingTiers(
        fixture.tiers,
        { quality: { type: 'boolean' } },
        'openai/gpt-image-2',
      ),
    ).toMatchObject({
      status: 'failed',
      reason: 'Resolver field quality does not match the provider input schema',
    });
  });
  it('rejects invalid criterion subtypes and unchanged unsupported metrics', () => {
    const fixture = REPLICATE_VARIANT_FIXTURES['openai/gpt-image-2'];
    if (!fixture) throw new Error('missing fixture');
    expect(
      mapReplicateBillingTiers(
        [
          {
            criteria: [
              { title: 'model variant', subtype: 'number', value: 'medium' },
            ],
            prices: [{ metric: 'image_output_count', price: '$1' }],
          },
        ],
        fixture.inputProperties,
        'openai/gpt-image-2',
      ),
    ).toMatchObject({
      status: 'failed',
      reason: 'unsupported_criterion_value:model_variant',
    });
    expect(
      mapReplicateBillingTiers(
        [{ criteria: [], prices: [{ metric: 'gpu_seconds', price: '$1' }] }],
        fixture.inputProperties,
        'openai/gpt-image-2',
      ),
    ).toEqual({ status: 'failed', reason: 'unmapped_metric:gpu_seconds' });
  });
});

describe('variant admission and frozen completion', () => {
  it.each([
    {
      endpoint: 'google/veo-3.1',
      input: { generate_audio: true },
      duration: 8,
      cost: 0.4 * 8,
      selectors: undefined,
    },
    {
      endpoint: 'openai/gpt-image-2',
      input: { quality: 'medium' },
      duration: undefined,
      cost: 0.047,
      selectors: undefined,
    },
    {
      endpoint: 'bytedance/seedance-2.5',
      input: {
        reference_videos: ['https://example.test/reference.mp4'],
        resolution: '720p',
      },
      duration: 5,
      cost: 0.9676 * 5,
      selectors: { resolution: '720p' },
    },
  ])('prices the exact issue sample for $endpoint', (sample) => {
    const model = profile(sample.endpoint);
    const request: ModelBillableQuoteRequest = {
      modelKey: model.key,
      provider: model.provider,
      ...(sample.duration ? { duration: sample.duration } : {}),
      ...(sample.selectors ? { selectors: sample.selectors } : {}),
    };
    const quote = quoteModelBillablePricing(model, request, 3.33, date, {
      kind: 'dispatch',
      input: {
        ...sample.input,
        prompt: 'private prompt',
        api_key: 'private credential',
      },
    });
    expect(quote).toMatchObject({
      status: 'priced',
      snapshot: {
        credits: applyMargin(sample.cost, 3.33),
        providerCostUsd: sample.cost,
      },
    });
    if (quote.status !== 'priced') throw new Error(quote.reason);
    expect(JSON.stringify(quote.snapshot)).not.toContain('private');
    expect(JSON.stringify(quote.snapshot)).not.toContain('reference.mp4');
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
      }),
    ).toEqual({
      status: 'priced',
      credits: quote.snapshot.credits,
      billableProviderCostUsd: quote.snapshot.providerCostUsd,
    });
  });
  it('requires dispatch evidence and rejects canonical selector disagreements', () => {
    const model = profile('openai/gpt-image-2');
    const request = {
      modelKey: model.key,
      provider: model.provider,
      selectors: { model_variant: 'high' },
    };
    expect(quoteModelBillablePricing(model, request, 3.33, date)).toEqual({
      status: 'unresolved',
      reason: 'Variant pricing requires dispatched provider input',
    });
    expect(
      quoteModelBillablePricing(model, request, 3.33, date, {
        kind: 'dispatch',
        input: { quality: 'low' },
      }),
    ).toEqual({
      status: 'unresolved',
      reason: 'Selected model_variant disagrees with the dispatched quality',
    });
  });
  it('prices verified auto defaults without guessing a variant from caller selectors', () => {
    const model = profile('openai/gpt-image-2');
    expect(
      quoteModelBillablePricing(
        model,
        { modelKey: model.key, provider: model.provider },
        3.33,
        date,
        { kind: 'dispatch', input: {} },
      ),
    ).toMatchObject({
      status: 'priced',
      snapshot: {
        providerCostUsd: 0.128,
        quantities: { selectors: { model_variant: 'auto' } },
      },
    });
    expect(
      resolveVariantSelectors(
        rules(),
        { kind: 'dispatch', input: {} },
        { model_variant: 'low' },
      ).status,
    ).toBe('unresolved');
  });
  it.each([undefined, []])(
    'treats missing and empty reference arrays as absent',
    (reference_videos) => {
      expect(
        resolveVariantSelectors(rules('bytedance/seedance-2.5'), {
          kind: 'dispatch',
          input: { reference_videos },
        }),
      ).toMatchObject({
        status: 'ok',
        selectors: { model_variant: 'non_video_in' },
      });
    },
  );
  it.each([null, '', [''], ['ok', 1], 1, {}])(
    'rejects malformed reference presence %j',
    (reference_videos) => {
      expect(
        resolveVariantSelectors(rules('bytedance/seedance-2.5'), {
          kind: 'dispatch',
          input: { reference_videos },
        }).status,
      ).toBe('unresolved');
    },
  );
  it('rejects presence disagreement and string false for a boolean driver', () => {
    expect(
      resolveVariantSelectors(
        rules('bytedance/seedance-2.5'),
        { kind: 'dispatch', input: {} },
        { model_variant: 'video_in' },
      ).status,
    ).toBe('unresolved');
    expect(
      resolveVariantSelectors(rules('google/veo-3.1'), {
        kind: 'dispatch',
        input: { generate_audio: 'false' },
      }).status,
    ).toBe('unresolved');
    expect(
      resolveVariantSelectors(rules('google/veo-3.1'), {
        kind: 'dispatch',
        input: { generate_audio: false },
      }),
    ).toMatchObject({
      status: 'ok',
      selectors: { model_variant: 'without_audio' },
    });
  });
  it('enumerates composite variants and rejects unsupported combinations', () => {
    expect(
      resolveVariantSelectors(rules('ideogram-ai/ideogram-4-5'), {
        kind: 'dispatch',
        input: { quality: 'high', images: ['image'] },
      }),
    ).toMatchObject({
      status: 'ok',
      selectors: { model_variant: 'high-with-source-images' },
    });
    expect(
      resolveVariantSelectors(rules('ideogram-ai/ideogram-4-5'), {
        kind: 'dispatch',
        input: { quality: 'very_low' },
      }).status,
    ).toBe('unresolved');
    expect(
      resolveVariantSelectors(rules('kwaivgi/kling-o1'), {
        kind: 'dispatch',
        input: { mode: 'std', reference_video: 'video' },
      }),
    ).toMatchObject({
      status: 'ok',
      selectors: { model_variant: 'std-with-video-input' },
    });
    expect(
      resolveVariantSelectors(rules('kwaivgi/kling-o1'), {
        kind: 'dispatch',
        input: { reference_video: '' },
      }).status,
    ).toBe('unresolved');
  });
  it('replays detached frozen metadata despite later catalog/default edits', () => {
    const model = profile('openai/gpt-image-2');
    const quote = quoteModelBillablePricing(
      model,
      { modelKey: model.key, provider: model.provider },
      3.33,
      date,
      { kind: 'dispatch', input: { quality: 'medium' } },
    );
    if (quote.status !== 'priced') throw new Error(quote.reason);
    const rule = model.reviewedPricing?.variantRules?.[0];
    if (rule?.derive.kind === 'field') {
      rule.derive.default = 'low';
      rule.derive.valueMap.medium = 'low';
    }
    expect(
      quoteModelBillableCompletion(quote.snapshot, {
        completedOutputs: 1,
        successfulRequests: 1,
      }),
    ).toMatchObject({ status: 'priced', credits: applyMargin(0.047, 3.33) });
    expect(
      resolveVariantSelectors(
        quote.snapshot.pricingProfile.reviewedPricing?.variantRules ?? [],
        { kind: 'frozen' },
        {},
      ).status,
    ).toBe('unresolved');
  });
});

describe('rule metadata identity and strict validation', () => {
  it('keeps legacy/rate drift hashes but adds frozen metadata to sheet version identity', () => {
    const result = mapped('openai/gpt-image-2');
    expect(hashReviewedRateSheetEntry({ rates: result.rates })).toBe(
      hashReviewedProviderRates(result.rates),
    );
    expect(hashReviewedRateSheetEntry(result)).not.toBe(
      hashReviewedProviderRates(result.rates),
    );
    expect(
      hashReviewedRateSheetEntry({
        ...result,
        rates: [...result.rates].reverse(),
      }),
    ).toBe(hashReviewedRateSheetEntry(result));
    const changed = structuredClone(result);
    const rule = changed.variantRules?.[0];
    if (rule?.derive.kind === 'field') rule.derive.default = 'high';
    expect(hashReviewedProviderRates(changed.rates)).toBe(
      hashReviewedProviderRates(result.rates),
    );
    expect(hashReviewedRateSheetEntry(changed)).not.toBe(
      hashReviewedRateSheetEntry(result),
    );
  });
  it.each([
    [],
    [{}],
    null,
    [{ selectorKey: 'model_variant', derive: { kind: 'unknown' } }],
  ])('rejects malformed rules %j', (value) =>
    expect(parseReviewedVariantRules(value)).toBeNull(),
  );
  it('rejects extra fields, duplicate keys, malformed defaults and composite ambiguity', () => {
    const original = rules();
    expect(parseReviewedVariantRules([original[0], original[0]])).toBeNull();
    expect(
      parseReviewedVariantRules([{ ...original[0], api_key: 'forbidden' }]),
    ).toBeNull();
    const invalid = structuredClone(original);
    if (invalid[0]?.derive.kind === 'field')
      invalid[0].derive.default = 'unpriced';
    expect(parseReviewedVariantRules(invalid)).toBeNull();
    const composite = rules('kwaivgi/kling-o1');
    if (composite[0]?.derive.kind === 'composite') {
      const first = composite[0].derive.cases[0];
      if (first) composite[0].derive.cases.push(first);
    }
    expect(parseReviewedVariantRules(composite)).toBeNull();
  });
});
