import type {
  IPlatformFeatureSettings,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';

/**
 * The rollout gate of the `task_routing.output_type` decision point (#4867),
 * an operator platform setting (#5407).
 *
 * Capped at shadow (release-blocker follow-up, epic #4863): Jev still
 * computes and records the output-type answer next to the keyword table's,
 * but nothing reads it back into `TaskRoutingService.resolveOutputType` — the
 * `mode !== 'live'` guard there always takes the keyword path because `live`
 * cannot come out of this function. The admin DTO refuses `live` and the
 * settings parser maps a hand-edited `live` back to `shadow`; this function
 * re-asserts the cap so no other source can bypass it.
 */
export function resolveTaskRoutingDecisionRollout(
  settings: IPlatformFeatureSettings,
): TypedDecisionRolloutSettings {
  return {
    minConfidence: settings.taskRoutingMinConfidence,
    mode: settings.taskRoutingDecisionMode === 'off' ? 'off' : 'shadow',
  };
}
