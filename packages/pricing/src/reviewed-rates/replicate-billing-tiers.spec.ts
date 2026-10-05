import { describe, expect, it } from 'vitest';
import {
  extractReplicateBillingTiers,
  mapReplicateBillingTiers,
} from './replicate-billing-tiers';
import {
  HAILUO_2_3_FAST_BILLING_TIERS,
  HAILUO_2_3_FAST_INPUT_PROPERTIES,
  HAILUO_2_3_FAST_PAGE_HTML,
} from './replicate-billing-tiers.fixture';

describe('extractReplicateBillingTiers', () => {
  it('reads billingConfig.current_tiers out of the page props script', () => {
    expect(extractReplicateBillingTiers(HAILUO_2_3_FAST_PAGE_HTML)).toEqual(
      HAILUO_2_3_FAST_BILLING_TIERS,
    );
  });

  it('returns null when the page carries no billing config', () => {
    expect(
      extractReplicateBillingTiers(
        '<script type="application/json">{"user":null}</script>',
      ),
    ).toBeNull();
    expect(extractReplicateBillingTiers('<html></html>')).toBeNull();
  });
});

describe('mapReplicateBillingTiers', () => {
  it('maps the hailuo-2.3-fast tiers to per-variant output rates', () => {
    const tiers = extractReplicateBillingTiers(HAILUO_2_3_FAST_PAGE_HTML) ?? [];
    expect(
      mapReplicateBillingTiers(tiers, HAILUO_2_3_FAST_INPUT_PROPERTIES),
    ).toEqual({
      rates: [
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.19,
          when: { resolution: '768P', duration: 6 },
        },
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.32,
          when: { resolution: '768P', duration: 10 },
        },
        {
          component: 'output',
          unit: 'output',
          unitPriceUsd: 0.33,
          when: { resolution: '1080P', duration: 6 },
        },
      ],
      selectorKeys: ['duration', 'resolution'],
      status: 'ok',
    });
  });

  it('fails the whole model on a criterion that maps to no input field', () => {
    const tiers = [
      {
        criteria: [
          {
            subtype: 'string',
            title: 'camera motion',
            type: 'equals',
            value: 'pan',
          },
        ],
        prices: [
          { metric: 'video_output_count', price: '$0.20', type: 'per-unit' },
        ],
      },
    ];
    expect(
      mapReplicateBillingTiers(tiers, HAILUO_2_3_FAST_INPUT_PROPERTIES),
    ).toEqual({ reason: 'unmapped_criterion:camera motion', status: 'failed' });
  });

  it('fails on an unmapped metric, a non-equals criterion or a value outside the schema', () => {
    const properties = HAILUO_2_3_FAST_INPUT_PROPERTIES;
    expect(
      mapReplicateBillingTiers(
        [{ criteria: [], prices: [{ metric: 'gpu_hours', price: '$1.00' }] }],
        properties,
      ),
    ).toEqual({ reason: 'unmapped_metric:gpu_hours', status: 'failed' });
    expect(
      mapReplicateBillingTiers(
        [
          {
            criteria: [
              { title: 'target resolution', type: 'range', value: '768P' },
            ],
            prices: [{ metric: 'video_output_count', price: '$0.19' }],
          },
        ],
        properties,
      ),
    ).toEqual({ reason: 'unsupported_criterion_type:range', status: 'failed' });
    expect(
      mapReplicateBillingTiers(
        [
          {
            criteria: [
              { subtype: 'string', title: 'target resolution', value: '4K' },
            ],
            prices: [{ metric: 'video_output_count', price: '$0.19' }],
          },
        ],
        properties,
      ),
    ).toEqual({
      reason: 'value_not_in_schema:resolution=4K',
      status: 'failed',
    });
  });

  it('fails on an unreadable or zero price rather than guessing', () => {
    expect(
      mapReplicateBillingTiers(
        [
          {
            criteria: [],
            prices: [{ metric: 'video_output_count', price: 'free' }],
          },
        ],
        HAILUO_2_3_FAST_INPUT_PROPERTIES,
      ),
    ).toEqual({ reason: 'invalid_price:video_output_count', status: 'failed' });
  });

  it('maps per-second and per-million-token prices to per-unit rates', () => {
    expect(
      mapReplicateBillingTiers(
        [
          {
            criteria: [],
            prices: [
              {
                metric: 'input_token_count',
                price: '$3.00',
                title: 'per million input tokens',
                type: 'per-million',
              },
              {
                metric: 'output_token_count',
                price: '$15.00',
                title: 'per million output tokens',
                type: 'per-million',
              },
              { metric: 'video_output_duration_seconds', price: '$0.05' },
            ],
          },
        ],
        {},
      ),
    ).toMatchObject({
      rates: [
        { unit: 'input-token', unitPriceUsd: 0.000003 },
        { unit: 'output-token', unitPriceUsd: 0.000015 },
        { isPerOutput: true, unit: 'second', unitPriceUsd: 0.05 },
      ],
      status: 'ok',
    });
  });
});
