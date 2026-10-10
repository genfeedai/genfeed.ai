import type { ReviewedProviderPricing } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { quoteReviewedProviderPricing } from './reviewed-provider-pricing';

const pricing: ReviewedProviderPricing = {
  currency: 'USD',
  sourceUrl: 'https://provider.example/pricing',
  verifiedAt: '2026-09-30T00:00:00Z',
  reviewStatus: 'approved',
  rates: [
    {
      component: 'output',
      unit: 'second',
      unitPriceUsd: 0.1,
      when: { resolution: '720p', audio: false },
      isPerOutput: true,
    },
    {
      component: 'output',
      unit: 'second',
      unitPriceUsd: 0.3,
      when: { resolution: '1080p', audio: true },
      isPerOutput: true,
    },
    {
      component: 'references',
      unit: 'reference',
      unitPriceUsd: 0.04,
      includedUnits: 5,
      when: {},
    },
  ],
};

describe('reviewed provider variant quotes', () => {
  it.each([
    { unitPriceUsd: 0.000014, width: 1280, height: 720, expected: 1.512 },
    { unitPriceUsd: 0.0000112, width: 1280, height: 720, expected: 1.2096 },
    { unitPriceUsd: 0.0000234, width: 1920, height: 1080, expected: 5.6862 },
    { unitPriceUsd: 0.0000024, width: 1280, height: 720, expected: 0.2592 },
    {
      unitPriceUsd: 0.000007,
      width: 1470,
      height: 630,
      expected: 0.75969140625,
    },
  ])('prices native video tokens without integer rounding: %s', (example) => {
    expect(
      quoteReviewedProviderPricing(
        {
          ...pricing,
          sourceUrl:
            'https://fal.ai/models/bytedance/seedance-2.0/text-to-video',
          rates: [
            {
              component: 'output',
              unit: 'video-token',
              unitPriceUsd: example.unitPriceUsd,
              when: {},
              isPerOutput: true,
            },
          ],
        },
        {
          duration: 5,
          width: example.width,
          height: example.height,
          framesPerSecond: 24,
        },
        1,
      ),
    ).toMatchObject({ status: 'priced', providerCostUsd: example.expected });
  });

  it('includes reference-video tokens and applies one conversion for all outputs', () => {
    const referencePricing: ReviewedProviderPricing = {
      ...pricing,
      sourceUrl:
        'https://fal.ai/learn/tools/how-to-create-multi-angle-video-seedance-2-5',
      rates: [
        {
          component: 'output',
          unit: 'video-token',
          unitPriceUsd: 0.0000084,
          when: {},
          isPerOutput: true,
        },
        {
          component: 'input',
          unit: 'input-video-token',
          unitPriceUsd: 0.0000084,
          when: {},
          isPerOutput: true,
        },
      ],
    };
    expect(
      quoteReviewedProviderPricing(
        referencePricing,
        {
          width: 1280,
          height: 720,
          duration: 5,
          inputDuration: 10,
          framesPerSecond: 24,
          outputs: 2,
        },
        1,
      ),
    ).toEqual({ status: 'priced', providerCostUsd: 5.4432, credits: 545 });
    expect(
      quoteReviewedProviderPricing(
        referencePricing,
        {
          width: 1280,
          height: 720,
          duration: 5,
          framesPerSecond: 24,
        },
        1,
      ).status,
    ).toBe('unresolved');
  });

  it.each([
    { framesPerSecond: undefined },
    { framesPerSecond: 0 },
    { framesPerSecond: Infinity },
    { width: 1280.5 },
    { height: 0 },
    { duration: 0 },
  ])('fails closed when native video-token usage is invalid: %s', (change) => {
    expect(
      quoteReviewedProviderPricing(
        {
          ...pricing,
          rates: [
            {
              component: 'output',
              unit: 'video-token',
              unitPriceUsd: 0.000014,
              when: {},
            },
          ],
        },
        {
          duration: 5,
          width: 1280,
          height: 720,
          framesPerSecond: 24,
          ...change,
        },
        1,
      ).status,
    ).toBe('unresolved');
  });

  it.each([
    { duration: 0.07, includedUnits: 0, roundUnitsTo: 0.01, expected: 0.07 },
    { duration: 0.4, includedUnits: 0.1, roundUnitsTo: 0.1, expected: 0.3 },
  ])('rounds decimal billed units without overcharging %s', (example) => {
    const result = quoteReviewedProviderPricing(
      {
        ...pricing,
        rates: [
          {
            component: 'duration',
            unit: 'second',
            unitPriceUsd: 1,
            includedUnits: example.includedUnits,
            roundUnitsTo: example.roundUnitsTo,
            when: {},
          },
        ],
      },
      { duration: example.duration },
      1,
    );
    expect(result).toMatchObject({
      status: 'priced',
      providerCostUsd: example.expected,
      credits: Math.round(example.expected * 100),
    });
  });
  it('rejects zero output-frame quantities for paid generation', () => {
    const framePricing: ReviewedProviderPricing = {
      ...pricing,
      rates: [
        { component: 'output', unit: 'frame', unitPriceUsd: 0.01, when: {} },
      ],
    };
    expect(
      quoteReviewedProviderPricing(framePricing, { frames: 0 }, 1).status,
    ).toBe('unresolved');
    expect(
      quoteReviewedProviderPricing(framePricing, { frames: 120 }, 1),
    ).toEqual({ status: 'priced', providerCostUsd: 1.2, credits: 120 });
  });
  it('bills the selected resolution/audio rate, all outputs, and extra input references before converting once', () => {
    expect(
      quoteReviewedProviderPricing(
        pricing,
        {
          duration: 30,
          outputs: 2,
          references: 8,
          selectors: { resolution: '1080p', audio: true },
        },
        1,
      ),
    ).toEqual({ status: 'priced', providerCostUsd: 18.12, credits: 1812 });
  });
  it.each([
    { duration: 30, references: 0 },
    {
      duration: 30,
      references: 0,
      selectors: { resolution: '4k', audio: true },
    },
    { references: 0, selectors: { resolution: '720p', audio: false } },
    {
      duration: Infinity,
      references: 0,
      selectors: { resolution: '720p', audio: false },
    },
    { duration: 30, selectors: { resolution: '720p', audio: false } },
    {
      duration: 30,
      outputs: 1.5,
      references: 0,
      selectors: { resolution: '720p', audio: false },
    },
  ])(
    'rejects an unpriced selector or missing/invalid billed quantity: %j',
    (input) => {
      expect(quoteReviewedProviderPricing(pricing, input, 1).status).toBe(
        'unresolved',
      );
    },
  );
  it('rejects ambiguous rate bands rather than picking the first', () => {
    expect(
      quoteReviewedProviderPricing(
        {
          ...pricing,
          rates: [
            ...pricing.rates,
            {
              component: 'output',
              unit: 'second' as const,
              unitPriceUsd: 0.1,
              when: { resolution: '720p', audio: false },
              isPerOutput: true,
            },
          ],
        },
        {
          duration: 5,
          references: 0,
          selectors: { resolution: '720p', audio: false },
        },
        1,
      ).status,
    ).toBe('unresolved');
  });
  it('counts input and output megapixels separately and bills batch output images', () => {
    const image: ReviewedProviderPricing = {
      ...pricing,
      rates: [
        {
          component: 'output',
          unit: 'megapixel',
          unitPriceUsd: 0.04,
          when: { quality: 'high' },
          isPerOutput: true,
          roundUnitsTo: 1,
        },
        {
          component: 'input',
          unit: 'input-megapixel',
          unitPriceUsd: 0.02,
          when: {},
        },
      ],
    };
    expect(
      quoteReviewedProviderPricing(
        image,
        {
          width: 1024,
          height: 1024,
          outputs: 4,
          inputMegapixels: 3,
          selectors: { quality: 'high' },
        },
        1,
      ),
    ).toEqual({ status: 'priced', providerCostUsd: 0.38, credits: 38 });
  });
  it('prices explicit tokens, characters, frames and input seconds without substituting output duration', () => {
    const metered: ReviewedProviderPricing = {
      ...pricing,
      rates: [
        {
          component: 'tokens-in',
          unit: 'input-token',
          unitPriceUsd: 0.000002,
          when: {},
        },
        {
          component: 'tokens-out',
          unit: 'output-token',
          unitPriceUsd: 0.00001,
          when: {},
        },
        {
          component: 'speech',
          unit: 'character',
          unitPriceUsd: 0.0001,
          when: {},
        },
        { component: 'frames', unit: 'frame', unitPriceUsd: 0.01, when: {} },
        {
          component: 'input-video',
          unit: 'input-second',
          unitPriceUsd: 0.02,
          when: {},
        },
      ],
    };
    expect(
      quoteReviewedProviderPricing(
        metered,
        {
          inputTokens: 1000,
          outputTokens: 1000,
          characters: 100,
          frames: 10,
          inputDuration: 4,
        },
        1,
      ),
    ).toEqual({ status: 'priced', providerCostUsd: 0.202, credits: 21 });
  });
  it.each([
    { unit: 'second' as const, includedUnits: 5, input: { duration: 5 } },
    {
      unit: 'input-token' as const,
      includedUnits: 0,
      input: { inputTokens: 0 },
    },
    { unit: 'character' as const, includedUnits: 0, input: { characters: 0 } },
    { unit: 'reference' as const, includedUnits: 0, input: { references: 0 } },
  ])('zero aggregate cost requires explicit free pricing: %j', (example) => {
    const profile: ReviewedProviderPricing = {
      ...pricing,
      rates: [
        {
          component: 'usage',
          unit: example.unit,
          unitPriceUsd: 0.1,
          includedUnits: example.includedUnits,
          when: {},
        },
      ],
    };
    expect(quoteReviewedProviderPricing(profile, example.input, 1)).toEqual({
      status: 'unresolved',
      reason: 'Zero provider cost requires an explicit free designation',
    });
    expect(
      quoteReviewedProviderPricing(
        { ...profile, isFree: true },
        example.input,
        1,
      ),
    ).toEqual({
      status: 'priced',
      providerCostUsd: 0,
      credits: 0,
    });
  });
  it('zero price requires an explicit reviewed free designation', () => {
    const zero: ReviewedProviderPricing = {
      ...pricing,
      rates: [{ component: 'run', unit: 'request', unitPriceUsd: 0, when: {} }],
    };
    expect(quoteReviewedProviderPricing(zero, {}, 1).status).toBe('unresolved');
    expect(
      quoteReviewedProviderPricing({ ...zero, isFree: true }, {}, 1),
    ).toEqual({ status: 'priced', providerCostUsd: 0, credits: 0 });
  });
  it.each([
    { currency: 'EUR' },
    { reviewStatus: 'pending' },
    { verifiedAt: '' },
    { sourceUrl: '' },
    { rates: [] },
  ])('fails closed without approved usable rate evidence: %j', (patch) => {
    expect(
      quoteReviewedProviderPricing({ ...pricing, ...patch }, {}, 1).status,
    ).toBe('unresolved');
  });
});
