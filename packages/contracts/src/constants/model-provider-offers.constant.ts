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
] as const;
