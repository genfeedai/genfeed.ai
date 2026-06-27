/**
 * Telegram Bot Model Maps
 *
 * Model shortname → provider model-id translation tables. Extracted out of the
 * workflow executors so adding a model is a one-line data edit rather than a
 * change inside a large method.
 */

/** fal.ai image model map (shortname → fal model id) */
export const FAL_IMAGE_MODEL_MAP: Record<string, string> = {
  'fal-flux-dev': 'fal-ai/flux/dev',
  'fal-flux-pro': 'fal-ai/flux-pro',
  'fal-flux-schnell': 'fal-ai/flux/schnell',
};

/** Replicate image model map (shortname → Replicate model id) */
export const REPLICATE_IMAGE_MODEL_MAP: Record<string, string> = {
  'flux-2-max': 'black-forest-labs/flux-2-max',
  'flux-2-pro': 'black-forest-labs/flux-2-pro',
  'flux-kontext-max': 'black-forest-labs/flux-kontext-max',
  'flux-schnell': 'black-forest-labs/flux-schnell',
  'gen-4.5': 'runwayml/gen-4.5',
  'gpt-image-2': 'openai/gpt-image-2',
  'grok-imagine-image': 'xai/grok-imagine-image',
  'grok-imagine-video': 'xai/grok-imagine-video',
  'hailuo-2.3': 'minimax/hailuo-2.3',
  'hailuo-2.3-fast': 'minimax/hailuo-2.3-fast',
  'imagen-3-fast': 'google/imagen-3-fast',
  'imagen-4-fast': 'google/imagen-4-fast',
  'kling-o1': 'kwaivgi/kling-o1',
  'kling-v2.6': 'kwaivgi/kling-v2.6',
  'nano-banana-2': 'google/nano-banana-2',
  'nano-banana-pro': 'google/nano-banana-pro',
  'pixverse-v6': 'pixverse/pixverse-v6',
  'q3-pro': 'vidu/q3-pro',
  'q3-turbo': 'vidu/q3-turbo',
  'recraft-v4': 'recraft-ai/recraft-v4',
  'recraft-v4-pro': 'recraft-ai/recraft-v4-pro',
  'seedance-2.0': 'bytedance/seedance-2.0',
  'seedance-2.0-fast': 'bytedance/seedance-2.0-fast',
  'seedream-5-lite': 'bytedance/seedream-5-lite',
  'veo-3.1-lite': 'google/veo-3.1-lite',
  'wan-2.7-t2v': 'wan-video/wan-2.7-t2v',
};

/** Replicate video model map (shortname → Replicate model id) */
export const REPLICATE_VIDEO_MODEL_MAP: Record<string, string> = {
  'kling-v2.1': 'kwaivgi/kling-v2.1',
  'veo-2': 'google/veo-2',
  'veo-3': 'google/veo-3',
  'veo-3-fast': 'google/veo-3-fast',
  'veo-3.1': 'google/veo-3.1',
  'veo-3.1-fast': 'google/veo-3.1-fast',
  'wan-2.2-i2v-fast': 'wan-video/wan-2.2-i2v-fast',
};
