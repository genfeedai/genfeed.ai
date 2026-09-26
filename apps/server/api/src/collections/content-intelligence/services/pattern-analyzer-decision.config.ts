import type {
  TypedDecisionMode,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/** Matches PATTERN_ANALYZER_MIN_CONFIDENCE's Joi default. */
export const PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE = 0.85;

/**
 * Rollout gate of the pattern analyzer's two label decisions (#4868).
 *
 * Capped at shadow (release-blocker follow-up, epic #4863): Jev still
 * computes and records both label answers next to the rule-based ones, but
 * `PatternAnalyzerService` only acts on a provider answer when `mode ===
 * 'live'`, which this function can no longer return. Hand-built
 * configuration cannot bypass that boundary — the same idiom
 * `resolveUntrustedContentDecisionConfig` uses for the untrusted-content gate.
 *
 * #4912 replaces this resolver, and every sibling one, with a settings
 * service. Keep it to this one function so that migration is a deletion.
 */
export function resolvePatternAnalyzerDecisionSettings(
  configService: ConfigService,
): TypedDecisionRolloutSettings {
  const configuredMode = String(
    configService.get('PATTERN_ANALYZER_DECISION_MODE') ?? '',
  ).trim();
  const mode: TypedDecisionMode = configuredMode === 'off' ? 'off' : 'shadow';

  const configuredConfidence = Number(
    configService.get('PATTERN_ANALYZER_MIN_CONFIDENCE'),
  );
  const isUsableConfidence =
    Number.isFinite(configuredConfidence) &&
    configuredConfidence >= 0 &&
    configuredConfidence <= 1;

  return {
    minConfidence: isUsableConfidence
      ? configuredConfidence
      : PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE,
    mode,
  };
}
