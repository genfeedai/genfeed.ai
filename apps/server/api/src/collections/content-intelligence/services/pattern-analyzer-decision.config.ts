import type {
  TypedDecisionMode,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/** Matches PATTERN_ANALYZER_MIN_CONFIDENCE's Joi default. */
export const PATTERN_ANALYZER_DEFAULT_MIN_CONFIDENCE = 0.85;

const TYPED_DECISION_MODES: readonly TypedDecisionMode[] = [
  'off',
  'shadow',
  'live',
];

function isTypedDecisionMode(value: string): value is TypedDecisionMode {
  return TYPED_DECISION_MODES.some((mode) => mode === value);
}

/**
 * Rollout gate of the pattern analyzer's two label decisions (#4868).
 *
 * Joi validates both keys, but workers and scripts can build a ConfigService
 * over a partial env, so an unreadable value degrades to the safe end of the
 * rollout — `off` keeps the rule-based labels, and an out-of-range floor falls
 * back to the shipped default rather than letting every answer through.
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
    mode: isTypedDecisionMode(configuredMode) ? configuredMode : 'off',
  };
}
