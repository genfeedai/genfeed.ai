import type { TypedDecisionMode } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/**
 * Default for UNTRUSTED_CONTENT_MIN_CONFIDENCE. Deliberately above the epic's
 * 0.85: a false positive here costs a user their tool result, so the gate must
 * be very sure before it withholds anything.
 */
export const UNTRUSTED_CONTENT_DEFAULT_MIN_CONFIDENCE = 0.95;

export interface UntrustedContentDecisionConfig {
  minConfidence: number;
  mode: TypedDecisionMode;
}

/**
 * The one place UNTRUSTED_CONTENT_DECISION_MODE and
 * UNTRUSTED_CONTENT_MIN_CONFIDENCE are read (#4870).
 *
 * Kept to a single function in a single file on purpose: #4912 replaces every
 * resolver of this shape with a settings service, and this is the whole
 * surface it has to replace.
 *
 * Joi validates both keys, so an out-of-range value cannot reach here from a
 * booted app; the guards below keep a hand-built ConfigService honest and make
 * the fallback the safe one — `off` is today's behaviour.
 *
 * The confidence bound is inclusive of 0, matching the Joi schema's `min(0)`:
 * a configured 0 means "withhold on any positive decision", and silently
 * replacing it with the default would loosen a threshold an operator
 * deliberately tightened.
 */
export function resolveUntrustedContentDecisionConfig(
  configService: ConfigService,
): UntrustedContentDecisionConfig {
  const rawMode = String(
    configService.get('UNTRUSTED_CONTENT_DECISION_MODE') ?? '',
  ).trim();
  // Hand-built configuration cannot bypass the closed live activation boundary.
  const mode: TypedDecisionMode = rawMode === 'shadow' ? 'shadow' : 'off';

  const rawConfidence = Number(
    configService.get('UNTRUSTED_CONTENT_MIN_CONFIDENCE'),
  );
  const minConfidence =
    Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
      ? rawConfidence
      : UNTRUSTED_CONTENT_DEFAULT_MIN_CONFIDENCE;

  return { minConfidence, mode };
}
