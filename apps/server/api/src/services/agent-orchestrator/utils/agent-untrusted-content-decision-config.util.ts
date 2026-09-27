import type {
  IPlatformFeatureSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';

export interface UntrustedContentDecisionConfig {
  minConfidence: number;
  mode: TypedDecisionMode;
}

/**
 * The untrusted-content gate's mode and threshold (#4870), operator platform
 * settings (#5407). The threshold defaults to 0.95, deliberately above the
 * epic's 0.85: a false positive here costs a user their tool result, so the
 * gate must be very sure before it withholds anything.
 *
 * Live activation is closed pending #4944: the admin DTO refuses `live`, the
 * settings parser maps a hand-edited value back, and this function re-asserts
 * the cap so no other source can bypass it.
 */
export function resolveUntrustedContentDecisionConfig(
  settings: IPlatformFeatureSettings,
): UntrustedContentDecisionConfig {
  return {
    minConfidence: settings.untrustedContentMinConfidence,
    mode: settings.untrustedContentDecisionMode === 'shadow' ? 'shadow' : 'off',
  };
}
