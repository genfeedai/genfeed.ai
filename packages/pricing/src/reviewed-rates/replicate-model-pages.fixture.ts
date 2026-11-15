/**
 * `billingConfig.current_tiers` as the public Replicate model pages served them
 * on 2026-11-15, one entry per model the model scanner got wrong that day.
 * Only the pricing-relevant fields are kept (criteria and prices).
 */
type PageTier = Record<string, unknown>;

const perImage = (price: string): PageTier['prices'] => [
  {
    metric: 'image_output_count',
    price,
    title: 'per output image',
    type: 'per-unit',
  },
];

const perSecond = (price: string): PageTier['prices'] => [
  {
    metric: 'video_output_duration_seconds',
    price,
    title: 'per second of output video',
    type: 'per-unit',
  },
];

const resolution = (
  value: string | null,
  prices: PageTier['prices'],
): PageTier => ({
  criteria: [
    {
      subtype: value === null ? 'null' : 'string',
      title: 'target resolution',
      type: 'equals',
      value,
    },
  ],
  prices,
});

/** black-forest-labs/flux-3-image: exactly twice the 2026-10-01 reviewed rates. */
export const FLUX_3_IMAGE_TIERS: PageTier[] = [
  resolution('768sq', perImage('$0.041')),
  resolution('1k', perImage('$0.048')),
  resolution('1.5k', perImage('$0.07')),
  resolution('2k', perImage('$0.10')),
  resolution('4k', perImage('$0.607')),
];

/** recraft-ai/recraft-v3: its style enum contains `realistic_image/motion_blur`. */
export const RECRAFT_V3_TIERS: PageTier[] = [
  { criteria: [], prices: perImage('$0.04') },
];

export const RECRAFT_V3_SVG_TIERS: PageTier[] = [
  { criteria: [], prices: perImage('$0.08') },
];

export const RECRAFT_V4_PRO_SVG_TIERS: PageTier[] = [
  { criteria: [], prices: perImage('$0.30') },
];

/** google/gemini-4-carbon: input per million tokens, output per thousand. */
export const GEMINI_4_CARBON_TIERS: PageTier[] = [
  {
    criteria: [],
    prices: [
      {
        metric: 'token_input_count',
        price: '$2',
        title: 'per million input tokens',
        type: 'per-unit',
      },
      {
        metric: 'token_output_count',
        price: '$0.01',
        title: 'per thousand output tokens',
        type: 'per-unit',
      },
    ],
  },
];

/** qwen/qwen3-7-plus: two token tiers split on input length. */
export const QWEN3_7_PLUS_TIERS: PageTier[] = [
  {
    criteria: [
      {
        subtype: 'open-closed',
        title: 'input token',
        type: 'range',
        value: [null, 256000],
      },
    ],
    prices: [
      {
        metric: 'token_input_count',
        price: '$0.276',
        title: 'per million input tokens',
        type: 'per-unit',
      },
      {
        metric: 'token_output_count',
        price: '$1.101',
        title: 'per million output tokens',
        type: 'per-unit',
      },
    ],
  },
  {
    criteria: [
      {
        subtype: 'open',
        title: 'input token',
        type: 'range',
        value: [256000, null],
      },
    ],
    prices: [
      {
        metric: 'token_input_count',
        price: '$0.826',
        title: 'per million input tokens',
        type: 'per-unit',
      },
      {
        metric: 'token_output_count',
        price: '$3.301',
        title: 'per million output tokens',
        type: 'per-unit',
      },
    ],
  },
];

/** minimax/video-01: two model variants at the same flat price per video. */
export const MINIMAX_VIDEO_01_TIERS: PageTier[] = ['t2v', 's2v'].map(
  (variant) => ({
    criteria: [
      {
        subtype: 'string',
        title: 'model variant',
        type: 'equals',
        value: variant,
      },
    ],
    prices: [
      {
        metric: 'video_output_count',
        price: '$0.50',
        title: 'per output video',
        type: 'per-unit',
      },
    ],
  }),
);

export const WAN_2_5_T2V_TIERS: PageTier[] = [
  resolution('480p', perSecond('$0.05')),
  resolution('720p', perSecond('$0.10')),
  resolution('1080p', perSecond('$0.15')),
];

/** xai/grok-text-to-speech: billed per thousand input characters. */
export const GROK_TEXT_TO_SPEECH_TIERS: PageTier[] = [
  {
    criteria: [],
    prices: [
      {
        metric: 'character_input_count',
        price: '$0.015',
        title: 'per thousand input characters',
        type: 'per-unit',
      },
    ],
  },
];

/**
 * xai/grok-imagine-video: a third tier whose target resolution is not set
 * ("Video edits and older builds"), priced like 480p.
 */
export const GROK_IMAGINE_VIDEO_TIERS: PageTier[] = [
  resolution('720p', perSecond('$0.07')),
  resolution('480p', perSecond('$0.05')),
  resolution(null, perSecond('$0.05')),
];

/** The grok-imagine-video input fields the resolution criterion maps onto. */
export const GROK_IMAGINE_VIDEO_INPUT_PROPERTIES = {
  duration: {
    default: 6,
    maximum: 15,
    minimum: 1,
    title: 'Duration',
    type: 'integer',
  },
  prompt: { title: 'Prompt', type: 'string' },
  resolution: {
    default: '720p',
    enum: ['720p', '480p'],
    title: 'Resolution',
    type: 'string',
  },
};
