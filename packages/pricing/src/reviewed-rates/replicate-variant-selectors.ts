import type {
  ReplicateVariantSelector,
  VariantScalar,
} from '@genfeedai/contracts/interfaces';

const field = (
  fieldName: string,
  valueMap: Record<string, VariantScalar>,
  criterionTitle = 'model variant',
  selectorKey = 'model_variant',
): ReplicateVariantSelector => ({
  criterionTitle,
  selectorKey,
  derive: { kind: 'field', field: fieldName, valueMap },
});
const identity = (...values: string[]): Record<string, VariantScalar> =>
  Object.fromEntries(values.map((value) => [value, value]));
const veo = [
  field('generate_audio', { true: 'with_audio', false: 'without_audio' }),
];
const gpt = [field('quality', identity('auto', 'low', 'medium', 'high'))];
const gpt25 = [
  field('quality', identity('auto', 'low', 'medium', 'high', 'xhigh', 'max')),
];
const seedance: ReplicateVariantSelector[] = [
  {
    criterionTitle: 'model variant',
    selectorKey: 'model_variant',
    derive: {
      kind: 'presence',
      field: 'reference_videos',
      whenPresent: 'video_in',
      whenAbsent: 'non_video_in',
    },
  },
];
const audio = field(
  'generate_audio',
  { true: true, false: false },
  'with audio',
  'with_audio',
);
const kling3 = [field('mode', identity('standard', 'pro', '4k')), audio];

/** Public schema + billingConfig evidence verified 2026-10-05; no prices or margins. */
export const REPLICATE_VARIANT_SELECTORS: Readonly<
  Record<string, readonly ReplicateVariantSelector[]>
> = {
  'google/veo-3': veo,
  'google/veo-3-fast': veo,
  'google/veo-3.1': veo,
  'google/veo-3.1-fast': veo,
  'openai/gpt-image-1.5': gpt,
  'openai/gpt-image-2': gpt,
  'openai/gpt-image-2.5-flare': gpt25,
  'openai/gpt-image-2.5-sunburst': gpt25,
  'ideogram-ai/ideogram-character': [
    field('rendering_speed', {
      Default: 'DEFAULT',
      Turbo: 'TURBO',
      Quality: 'QUALITY',
    }),
  ],
  'black-forest-labs/flux-2-dev': [
    field('go_fast', { true: 'go_fast', false: 'regular' }),
  ],
  // Public schema and billingConfig, 2026-10-07: draft and continuation rates.
  'black-forest-labs/flux-3': [
    {
      criterionTitle: 'model variant',
      selectorKey: 'model_variant',
      derive: {
        kind: 'composite',
        parts: [
          { field: 'start_video', mode: 'presence' },
          { field: 'draft', mode: 'value' },
        ],
        cases: [
          { when: [false, false], selector: 't2v_i2v' },
          { when: [false, true], selector: 't2v_i2v_draft' },
          { when: [true, false], selector: 'v2v' },
          { when: [true, true], selector: 'v2v_draft' },
        ],
      },
    },
  ],
  // Public schema and billingConfig, 2026-10-09.
  'bytedance/seedance-2.0': seedance,
  'bytedance/seedance-2.0-fast': seedance,
  'bytedance/seedance-2.0-mini': seedance,
  'bytedance/seedance-2.5': seedance,
  'kwaivgi/kling-v2.1': [field('mode', identity('standard', 'pro'))],
  'kwaivgi/kling-v2.6': [audio],
  'kwaivgi/kling-v3-video': kling3,
  'kwaivgi/kling-v3-omni-video': kling3,
  'kwaivgi/kling-avatar-v2': [field('mode', identity('std', 'pro'))],
  'luma/reframe-image': [
    field('model', identity('photon-flash-1', 'photon-1')),
  ],
  'prunaai/p-video': [field('draft', { false: 'base', true: 'draft' })],
  'wan-video/wan-2.2-i2v-fast': [
    field('interpolate_output', { false: 'base', true: 'interpolate' }),
  ],
  'pixverse/pixverse-v6': [
    field(
      'generate_audio_switch',
      { true: true, false: false },
      'with audio',
      'with_audio',
    ),
    field(
      'quality',
      identity('360p', '540p', '720p', '1080p'),
      'target resolution',
      'target_resolution',
    ),
  ],
  'ideogram-ai/ideogram-4-5': [
    {
      criterionTitle: 'model variant',
      selectorKey: 'model_variant',
      derive: {
        kind: 'composite',
        parts: [
          { field: 'quality', mode: 'value' },
          { field: 'images', mode: 'presence' },
        ],
        cases: [
          { when: ['low', false], selector: 'low' },
          { when: ['medium', false], selector: 'medium' },
          { when: ['high', false], selector: 'high' },
          { when: ['very_low', true], selector: 'very_low-with-source-images' },
          { when: ['low', true], selector: 'low-with-source-images' },
          { when: ['medium', true], selector: 'medium-with-source-images' },
          { when: ['high', true], selector: 'high-with-source-images' },
        ],
      },
    },
  ],
  // Public schema and billingConfig, 2026-10-15: standard mode bills by size.
  'bytedance/seedream-5-pro': [
    field('size', identity('1K', '2K'), 'target resolution', 'resolution'),
  ],
  'kwaivgi/kling-o1': [
    {
      criterionTitle: 'model variant',
      selectorKey: 'model_variant',
      derive: {
        kind: 'composite',
        parts: [
          { field: 'mode', mode: 'value' },
          { field: 'reference_video', mode: 'presence' },
        ],
        cases: [
          { when: ['std', false], selector: 'std' },
          { when: ['std', true], selector: 'std-with-video-input' },
          { when: ['pro', false], selector: 'pro' },
          { when: ['pro', true], selector: 'pro-with-video-input' },
        ],
      },
    },
  ],
};

/**
 * Billing tiers no request we dispatch can reach, dropped before mapping so an
 * unreachable price neither fails the refresh nor reads as a price change.
 * Each entry names the input that keeps the tier unreachable.
 */
export const REPLICATE_UNREACHABLE_BILLING_TIERS: Readonly<
  Record<
    string,
    readonly { criterionTitle: string; values: readonly VariantScalar[] }[]
  >
> = {
  // Layer decomposition needs `layer_decomposition: true`, which we never send.
  'bytedance/seedream-5-pro': [
    { criterionTitle: 'model variant', values: ['layer-small', 'layer-large'] },
  ],
  // Replicate's own fallback route; `resolution` accepts only 1K, 2K and 4K.
  'google/nano-banana-pro': [
    { criterionTitle: 'target resolution', values: ['fallback'] },
  ],
};

export const DERIVED_CRITERION_TITLES = [
  'model variant',
  'with audio',
  'target resolution',
] as const;
