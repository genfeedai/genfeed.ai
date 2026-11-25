import { MODEL_KEYS } from './model-keys.constant';

/**
 * The resolution tier Replicate runs when a request sends none, per each
 * model's published input schema. The reviewed rate sheet prices these models
 * per tier, so a quote with no tier is refused. Every path that builds a
 * Nano Banana request (the prompt builder and the brief compiler) sends this
 * tier, so the tier quoted is the tier sent.
 */
export const NANO_BANANA_DEFAULT_RESOLUTION: Readonly<Record<string, string>> =
  {
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2]: '1K',
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_1]: '1K',
    [MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO]: '2K',
  };
