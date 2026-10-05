import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { DurationUtil } from '@genfeedai/helpers';

interface ProviderDurationRule {
  allowed: number[];
  fallback: number;
}

/**
 * Models whose provider only accepts a fixed set of clip lengths. The prompt
 * builder and the Studio estimate both read this table, so the duration that
 * is priced is the duration the provider executes (Hailuo 5 s runs as 6 s).
 */
const PROVIDER_VIDEO_DURATION_RULES: Readonly<
  Record<string, ProviderDurationRule>
> = {
  [MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3]: { allowed: [6, 10], fallback: 6 },
  [MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST]: {
    allowed: [6, 10],
    fallback: 6,
  },
  [MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE]: {
    allowed: [4, 6, 8],
    fallback: 8,
  },
  [MODEL_KEYS.REPLICATE_OPENAI_SORA_2]: { allowed: [4, 8, 12], fallback: 4 },
  [MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO]: {
    allowed: [4, 8, 12],
    fallback: 4,
  },
};

/** Whether the provider's duration handling for this model is known here. */
export function hasProviderVideoDurationRule(modelKey: string): boolean {
  return modelKey in PROVIDER_VIDEO_DURATION_RULES;
}

/**
 * The clip length the provider executes for a requested duration, or the
 * request unchanged for a model with no fixed-length rule.
 */
export function normalizeProviderVideoDuration(
  modelKey: string,
  duration: number | undefined,
): number | undefined {
  const rule = PROVIDER_VIDEO_DURATION_RULES[modelKey];
  if (!rule) return duration;
  return DurationUtil.validateAndNormalize(
    duration,
    rule.allowed,
    rule.fallback,
  );
}
