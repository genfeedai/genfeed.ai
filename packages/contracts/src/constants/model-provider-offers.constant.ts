/** Reviewed equivalence, never inferred from display labels. */
export const MODEL_PROVIDER_ASSOCIATIONS = [
  {
    modelKey: 'google/veo-3.1',
    executionModelKey: 'fal-ai/veo3.1',
    provider: 'fal',
    endpoint: 'fal-ai/veo3.1',
  },
  {
    modelKey: 'kwaivgi/kling-v3-video',
    executionModelKey: 'kie/kling-3.0',
    provider: 'kie',
    endpoint: 'kling-3.0/video',
  },
] as const;
