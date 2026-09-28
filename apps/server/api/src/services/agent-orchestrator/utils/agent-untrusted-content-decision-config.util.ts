import type {
  IPlatformFeatureSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';

export interface UntrustedContentDecisionConfig {
  minConfidence: number;
  mode: TypedDecisionMode;
}

/**
 * The untrusted-content gate's mode and threshold (#4870), the
 * `untrusted_content_decision` PostHog flag (#5468). The threshold defaults to 0.95, deliberately above the
 * epic's 0.85: a false positive here costs a user their tool result, so the
 * gate must be very sure before it withholds anything.
 *
 * Live activation is closed pending #4944: the flag parser maps a `live`
 * variant back, and this function re-asserts the cap so no other source can
 * bypass it.
 */
export function resolveUntrustedContentDecisionConfig(
  settings: IPlatformFeatureSettings,
): UntrustedContentDecisionConfig {
  return {
    minConfidence: settings.untrustedContentMinConfidence,
    mode: settings.untrustedContentDecisionMode === 'shadow' ? 'shadow' : 'off',
  };
}
