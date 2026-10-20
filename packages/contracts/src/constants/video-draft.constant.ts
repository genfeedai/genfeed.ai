import { MODEL_KEYS } from './model-keys.constant';

/**
 * The cheaper sibling of a video model, used for a draft: same family and
 * look, a fraction of the provider rate (Veo 3.1 with audio $0.40/s vs
 * $0.15/s). A model with no entry is drafted on itself, at its lowest
 * resolution, shortest length and without audio.
 */
export const VIDEO_DRAFT_MODEL_KEYS: Readonly<Record<string, string>> = {
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1]:
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
};

export function resolveVideoDraftModelKey(modelKey: string): string {
  return VIDEO_DRAFT_MODEL_KEYS[modelKey] ?? modelKey;
}
