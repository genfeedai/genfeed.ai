import type {
  IPlatformFeatureSettings,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';

/**
 * Rollout gate of the pattern analyzer's two label decisions (#4868), an
 * operator platform setting (#5407).
 *
 * Capped at shadow (release-blocker follow-up, epic #4863): Jev still
 * computes and records both label answers next to the rule-based ones, but
 * `PatternAnalyzerService` only acts on a provider answer when `mode ===
 * 'live'`, which this function can never return — the same idiom
 * `resolveUntrustedContentDecisionConfig` uses for the untrusted-content gate.
 */
export function resolvePatternAnalyzerDecisionSettings(
  settings: IPlatformFeatureSettings,
): TypedDecisionRolloutSettings {
  return {
    minConfidence: settings.patternAnalyzerMinConfidence,
    mode: settings.patternAnalyzerDecisionMode === 'off' ? 'off' : 'shadow',
  };
}
