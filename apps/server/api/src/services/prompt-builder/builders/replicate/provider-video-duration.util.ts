import {
  getModelDurationsForResolution,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
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
};

/** Whether the provider's duration handling for this model is known here. */
export function hasProviderVideoDurationRule(modelKey: string): boolean {
  return modelKey in PROVIDER_VIDEO_DURATION_RULES;
}

/**
 * The clip length the provider executes for a requested duration, or the
 * request unchanged for a model with no fixed-length rule. A resolution the
 * provider caps below the model's lengths (Hailuo 1080p runs 6 s only) narrows
 * the allowed lengths to that cap.
 */
export function normalizeProviderVideoDuration(
  modelKey: string,
  duration: number | undefined,
  resolution?: string | null,
): number | undefined {
  const rule = PROVIDER_VIDEO_DURATION_RULES[modelKey];
  if (!rule) return duration;
  const resolutionDurations = getModelDurationsForResolution(
    modelKey,
    resolution,
  );
  const narrowed = rule.allowed.filter((allowed) =>
    resolutionDurations.includes(allowed),
  );
  const allowed = narrowed.length > 0 ? narrowed : rule.allowed;
  return DurationUtil.validateAndNormalize(
    duration,
    allowed,
    allowed.includes(rule.fallback) ? rule.fallback : allowed[0],
  );
}
