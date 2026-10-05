import { describe, expect, it } from 'vitest';
import { mapReplicateBillingTiers } from './replicate-billing-tiers';

/** Public Replicate schema/billingConfig observations, checked 2026-10-05. */
describe('derived Replicate billing criteria (#6224)', () => {
  it.each([
    {
      endpoint: 'google/veo-3.1',
      field: 'generate_audio',
      property: { type: 'boolean', default: true },
      value: 'with_audio',
      metric: 'video_output_duration_seconds',
      price: '$0.40',
      unit: 'second',
      unitPriceUsd: 0.4,
    },
    {
      endpoint: 'openai/gpt-image-2',
      field: 'quality',
      property: {
        type: 'string',
        enum: ['auto', 'low', 'medium', 'high'],
        default: 'auto',
      },
      value: 'medium',
      metric: 'image_output_count',
      price: '$0.047',
      unit: 'output',
      unitPriceUsd: 0.047,
    },
    {
      endpoint: 'bytedance/seedance-2.5',
      field: 'reference_videos',
      property: {
        type: 'array',
        items: { type: 'string', format: 'uri' },
        default: [],
      },
      value: 'video_in',
      metric: 'video_output_duration_seconds',
      price: '$0.9676',
      unit: 'second',
      unitPriceUsd: 0.9676,
    },
  ])('maps $endpoint model variant from its real schema', (sample) => {
    // Reflect keeps this regression runnable against the two-argument base mapper.
    const result: unknown = Reflect.apply(mapReplicateBillingTiers, undefined, [
      [
        {
          criteria: [
            {
              title: 'model variant',
              subtype: 'string',
              type: 'equals',
              value: sample.value,
            },
          ],
          prices: [
            { metric: sample.metric, type: 'per-unit', price: sample.price },
          ],
        },
      ],
      { [sample.field]: sample.property },
      sample.endpoint,
    ]);
    expect(result).toMatchObject({
      status: 'ok',
      selectorKeys: ['model_variant'],
      rates: [
        {
          unit: sample.unit,
          unitPriceUsd: sample.unitPriceUsd,
          when: { model_variant: sample.value },
        },
      ],
    });
  });
});
