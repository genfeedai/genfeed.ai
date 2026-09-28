import type {
  IPlatformFeatureSettings,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';

/**
 * The rollout gate of the `task_routing.output_type` decision point (#4867),
 * the `task_routing_decision` PostHog flag (#5468).
 *
 * Capped at shadow (release-blocker follow-up, epic #4863): Jev still
 * computes and records the output-type answer next to the keyword table's,
 * but nothing reads it back into `TaskRoutingService.resolveOutputType` — the
 * `mode !== 'live'` guard there always takes the keyword path because `live`
 * cannot come out of this function. The flag parser maps a `live` variant
 * back to `shadow`; this function re-asserts the cap so no other source can
 * bypass it.
 */
export function resolveTaskRoutingDecisionRollout(
  settings: IPlatformFeatureSettings,
): TypedDecisionRolloutSettings {
  return {
    minConfidence: settings.taskRoutingMinConfidence,
    mode: settings.taskRoutingDecisionMode === 'off' ? 'off' : 'shadow',
  };
}
