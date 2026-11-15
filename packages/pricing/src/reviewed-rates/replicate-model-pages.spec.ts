import { describe, expect, it } from 'vitest';
import { quoteReviewedProviderPricing } from '../reviewed-provider-pricing';
import {
  mapReplicateBillingTiers,
  REPLICATE_UNSET_SELECTOR_VALUE,
  replicateBillingMediaFamily,
} from './replicate-billing-tiers';
import {
  FLUX_3_IMAGE_TIERS,
  GEMINI_4_CARBON_TIERS,
  GROK_IMAGINE_VIDEO_INPUT_PROPERTIES,
  GROK_IMAGINE_VIDEO_TIERS,
  GROK_TEXT_TO_SPEECH_TIERS,
  MINIMAX_VIDEO_01_TIERS,
  QWEN3_7_PLUS_TIERS,
  RECRAFT_V3_SVG_TIERS,
  RECRAFT_V3_TIERS,
  RECRAFT_V4_PRO_SVG_TIERS,
  WAN_2_5_T2V_TIERS,
} from './replicate-model-pages.fixture';

describe('replicateBillingMediaFamily', () => {
  it.each([
    ['black-forest-labs/flux-3-image', FLUX_3_IMAGE_TIERS, 'image'],
    ['recraft-ai/recraft-v3', RECRAFT_V3_TIERS, 'image'],
    ['recraft-ai/recraft-v3-svg', RECRAFT_V3_SVG_TIERS, 'image'],
    ['recraft-ai/recraft-v4-pro-svg', RECRAFT_V4_PRO_SVG_TIERS, 'image'],
    ['google/gemini-4-carbon', GEMINI_4_CARBON_TIERS, 'text'],
    ['qwen/qwen3-7-plus', QWEN3_7_PLUS_TIERS, 'text'],
    ['minimax/video-01', MINIMAX_VIDEO_01_TIERS, 'video'],
    ['wan-video/wan-2.5-t2v', WAN_2_5_T2V_TIERS, 'video'],
    ['xai/grok-imagine-video', GROK_IMAGINE_VIDEO_TIERS, 'video'],
    ['xai/grok-text-to-speech', GROK_TEXT_TO_SPEECH_TIERS, 'voice'],
  ])('reads %s as %s from its billing metric', (_model, tiers, family) => {
    expect(replicateBillingMediaFamily(tiers)).toBe(family);
  });

  it('says nothing for a flat per-run price or an empty page', () => {
    expect(
      replicateBillingMediaFamily([
        { prices: [{ metric: 'run_count', price: '$0.01', type: 'fixed' }] },
      ]),
    ).toBeNull();
    expect(replicateBillingMediaFamily([])).toBeNull();
  });

  it('reads an audio output metric as audio, and output before input', () => {
    expect(
      replicateBillingMediaFamily([
        {
          prices: [
            {
              metric: 'audio_output_duration_seconds',
              price: '$0.01',
              title: 'per second of output audio',
              type: 'per-unit',
            },
          ],
        },
      ]),
    ).toBe('audio');
    expect(
      replicateBillingMediaFamily([
        {
          prices: [
            { metric: 'image_input_megapixel_count', price: '$0.01' },
            { metric: 'image_output_count', price: '$0.04' },
            { metric: 'token_input_count', price: '$2' },
          ],
        },
      ]),
    ).toBe('image');
  });
});

describe('mapReplicateBillingTiers on the 2026-11-15 pages', () => {
  it('prices recraft-v3 at $0.04 per output image', () => {
    expect(mapReplicateBillingTiers(RECRAFT_V3_TIERS, {})).toEqual({
      rates: [
        { component: 'output', unit: 'output', unitPriceUsd: 0.04, when: {} },
      ],
      selectorKeys: [],
      status: 'ok',
    });
  });

  it('prices the two SVG models per output image', () => {
    const svg = mapReplicateBillingTiers(RECRAFT_V3_SVG_TIERS, {});
    const pro = mapReplicateBillingTiers(RECRAFT_V4_PRO_SVG_TIERS, {});
    expect(svg.status === 'ok' && svg.rates[0]?.unitPriceUsd).toBe(0.08);
    expect(pro.status === 'ok' && pro.rates[0]?.unitPriceUsd).toBe(0.3);
  });

  it('prices FLUX.3 at twice the 2026-10-01 reviewed rates', () => {
    const result = mapReplicateBillingTiers(FLUX_3_IMAGE_TIERS, {
      resolution: {
        enum: ['768sq', '1k', '1.5k', '2k', '4k'],
        title: 'Resolution',
        type: 'string',
      },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rates.map((rate) => rate.unitPriceUsd)).toEqual([
      0.041, 0.048, 0.07, 0.1, 0.607,
    ]);
  });

  it('prices gemini-4-carbon per token, scaling million and thousand lists', () => {
    const result = mapReplicateBillingTiers(GEMINI_4_CARBON_TIERS, {});
    expect(result).toEqual({
      rates: [
        {
          component: 'input-token',
          unit: 'input-token',
          unitPriceUsd: 0.000002,
          when: {},
        },
        {
          component: 'output-token',
          unit: 'output-token',
          unitPriceUsd: 0.00001,
          when: {},
        },
      ],
      selectorKeys: [],
      status: 'ok',
    });
  });

  it('prices grok-text-to-speech per input character', () => {
    const result = mapReplicateBillingTiers(GROK_TEXT_TO_SPEECH_TIERS, {});
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rates).toHaveLength(1);
    expect(result.rates[0]).toMatchObject({
      component: 'character',
      unit: 'character',
      when: {},
    });
    expect(result.rates[0]?.unitPriceUsd).toBeCloseTo(0.000015, 12);
  });

  it('prices wan-2.5-t2v per second at each resolution', () => {
    const result = mapReplicateBillingTiers(WAN_2_5_T2V_TIERS, {
      resolution: {
        enum: ['480p', '720p', '1080p'],
        title: 'Resolution',
        type: 'string',
      },
    });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(
      result.rates.map((rate) => [rate.when.resolution, rate.unitPriceUsd]),
    ).toEqual([
      ['480p', 0.05],
      ['720p', 0.1],
      ['1080p', 0.15],
    ]);
  });

  it('reads the grok-imagine-video tier whose resolution is not set as its own rate', () => {
    const result = mapReplicateBillingTiers(
      GROK_IMAGINE_VIDEO_TIERS,
      GROK_IMAGINE_VIDEO_INPUT_PROPERTIES,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(
      result.rates.map((rate) => [rate.when.resolution, rate.unitPriceUsd]),
    ).toEqual([
      ['720p', 0.07],
      ['480p', 0.05],
      [REPLICATE_UNSET_SELECTOR_VALUE, 0.05],
    ]);
    expect(result.selectorKeys).toEqual(['resolution']);
  });

  it('quotes the not-set grok-imagine-video rate for a variant that omits the resolution', () => {
    const result = mapReplicateBillingTiers(
      GROK_IMAGINE_VIDEO_TIERS,
      GROK_IMAGINE_VIDEO_INPUT_PROPERTIES,
    );
    if (result.status !== 'ok') throw new Error('mapping failed');
    const quote = quoteReviewedProviderPricing(
      {
        currency: 'USD',
        rates: result.rates,
        reviewStatus: 'approved',
        sourceUrl: 'https://replicate.com/xai/grok-imagine-video',
        verifiedAt: '2026-11-15T00:00:00.000Z',
      },
      {
        duration: 5,
        selectors: { resolution: REPLICATE_UNSET_SELECTOR_VALUE },
      },
      3.33,
    );
    expect(quote).toMatchObject({ providerCostUsd: 0.25, status: 'priced' });
  });

  it('fails minimax/video-01 until its model variants have a resolver, not guessing a rate', () => {
    expect(mapReplicateBillingTiers(MINIMAX_VIDEO_01_TIERS, {})).toEqual({
      reason: 'model variant needs a resolver entry',
      status: 'failed',
    });
  });

  it('fails qwen3-7-plus on its range tiers instead of guessing a rate', () => {
    expect(mapReplicateBillingTiers(QWEN3_7_PLUS_TIERS, {})).toEqual({
      reason: 'unmapped_criterion:input token',
      status: 'failed',
    });
  });
});
