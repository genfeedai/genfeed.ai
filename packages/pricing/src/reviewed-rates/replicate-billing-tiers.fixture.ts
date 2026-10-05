/**
 * The pricing-relevant part of the public Replicate page for
 * `minimax/hailuo-2.3-fast` (replicate.com/minimax/hailuo-2.3-fast), as
 * observed 2026-10-05: 768P/6s $0.19, 768P/10s $0.32, 1080P/6s $0.33 per output
 * video. The page embeds its props in a `<script type="application/json">`;
 * this fixture keeps that envelope and the `billingConfig.current_tiers` shape,
 * and drops the rest of the page.
 */
const tier = (
  resolution: string,
  seconds: number,
  price: string,
): Record<string, unknown> => ({
  criteria: [
    {
      subtype: 'string',
      title: 'target resolution',
      type: 'equals',
      value: resolution,
    },
    {
      subtype: 'number',
      title: 'second of output video',
      type: 'equals',
      value: seconds,
    },
  ],
  prices: [
    {
      metric: 'video_output_count',
      price,
      title: 'per output video',
      type: 'per-unit',
    },
  ],
});

export const HAILUO_2_3_FAST_BILLING_TIERS = [
  tier('768P', 6, '$0.19'),
  tier('768P', 10, '$0.32'),
  tier('1080P', 6, '$0.33'),
];

export const HAILUO_2_3_FAST_PAGE_HTML = `<!doctype html><html><head><title>minimax/hailuo-2.3-fast | Replicate</title></head><body>
<script type="application/json" id="react-component-props-ModelPage">${JSON.stringify(
  {
    model: {
      billingConfig: { current_tiers: HAILUO_2_3_FAST_BILLING_TIERS },
      name: 'hailuo-2.3-fast',
      owner: 'minimax',
    },
  },
)}</script>
<script type="application/json" id="react-component-props-Header">{"user":null}</script>
</body></html>`;

/** Input properties as Replicate's OpenAPI schema titles them. */
export const HAILUO_2_3_FAST_INPUT_PROPERTIES = {
  duration: { default: 6, enum: [6, 10], title: 'Duration', type: 'integer' },
  first_frame_image: { title: 'First Frame Image', type: 'string' },
  prompt: { title: 'Prompt', type: 'string' },
  prompt_optimizer: {
    default: true,
    title: 'Prompt Optimizer',
    type: 'boolean',
  },
  resolution: {
    default: '768p',
    enum: ['768p', '1080p'],
    title: 'Resolution',
    type: 'string',
  },
};
