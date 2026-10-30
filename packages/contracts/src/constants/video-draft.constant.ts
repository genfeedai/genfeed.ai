import { MODEL_KEYS } from './model-keys.constant';

/**
 * The cheaper sibling of a video model, used for a draft: same family, a
 * fraction of the provider rate. Candidates are tried in order, so a draft
 * falls back to the next one when a sibling is not on offer. Veo 3.1 Lite is
 * $0.05/s at 720p, against Veo 3.1 fast at $0.15/s with audio and $0.10/s
 * without (reviewed rate sheet). A model with no entry is drafted on itself,
 * at its lowest resolution, shortest length and without audio.
 */
export const VIDEO_DRAFT_MODEL_KEYS: Readonly<
  Record<string, readonly string[]>
> = {
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3]: [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST],
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
  ],
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST]: [
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
    MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
  ],
};

export function resolveVideoDraftModelKey(
  modelKey: string,
  isOffered: (candidateKey: string) => boolean = () => true,
): string {
  const candidates = VIDEO_DRAFT_MODEL_KEYS[modelKey];
  if (!candidates) return modelKey;
  return candidates.find(isOffered) ?? candidates[0];
}
