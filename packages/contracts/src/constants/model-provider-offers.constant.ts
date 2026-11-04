/** Reviewed equivalence, never inferred from display labels. */
export const MODEL_PROVIDER_ASSOCIATIONS = [
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'kie/kling-3.0',
    provider: 'kie',
    endpoint: 'kling-3.0/video',
  },
  {
    // Both are Google's Nano Banana 2 (fal describes its endpoint as such,
    // checked 2026-11-01). fal's text-to-image endpoint has no reference-image
    // input, so a request with reference images stays on Replicate.
    modelKey: 'google/nano-banana-2',
    executionModelKey: 'fal-ai/nano-banana-2',
    provider: 'fal',
    endpoint: 'fal-ai/nano-banana-2',
  },
  {
    // Both are Recraft V4 Pro text-to-image at a flat $0.25 per image.
    modelKey: 'recraft-ai/recraft-v4-pro',
    executionModelKey: 'fal-ai/recraft/v4/pro',
    provider: 'fal',
    endpoint: 'fal-ai/recraft/v4/pro/text-to-image',
  },
  {
    // Both are PixVerse V6 text-to-video; fal prices by resolution and audio
    // per second from its model page. fal's text endpoint has no image input,
    // so an image-to-video request stays on Replicate.
    modelKey: 'pixverse/pixverse-v6',
    executionModelKey: 'fal-ai/pixverse/v6',
    provider: 'fal',
    endpoint: 'fal-ai/pixverse/v6/text-to-video',
  },
] as const;
