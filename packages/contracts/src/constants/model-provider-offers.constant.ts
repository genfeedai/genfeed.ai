/** Reviewed equivalence, never inferred from display labels. */
export const MODEL_PROVIDER_ASSOCIATIONS = [
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'kie/kling-3.0',
    provider: 'kie',
    endpoint: 'kling-3.0/video',
  },
  // Kling 3.0 on fal: one endpoint per tier (Replicate's `mode`) and per text
  // or image start, reviewed against fal's OpenAPI and Replicate's schema
  // (2026-11-04). The input adapter refuses an offer whose tier or start does
  // not match the request, so only the matching endpoint is ever quoted. 4K
  // stays on Replicate: fal charges the same flat rate there.
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'fal-ai/kling-video/v3/pro',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/pro/text-to-video',
  },
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'fal-ai/kling-video/v3/pro/image-to-video',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/pro/image-to-video',
  },
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'fal-ai/kling-video/v3/standard/text-to-video',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/standard/text-to-video',
  },
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'fal-ai/kling-video/v3/standard/image-to-video',
    provider: 'fal',
    endpoint: 'fal-ai/kling-video/v3/standard/image-to-video',
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
