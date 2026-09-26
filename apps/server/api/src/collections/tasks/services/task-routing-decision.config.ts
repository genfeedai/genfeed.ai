import type {
  TypedDecisionMode,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/** Mirrors the Joi default of TASK_ROUTING_MIN_CONFIDENCE. */
export const TASK_ROUTING_DEFAULT_MIN_CONFIDENCE = 0.85;

/** Mirrors the Joi default of TASK_ROUTING_DECISION_MODE. */
export const TASK_ROUTING_DEFAULT_DECISION_MODE: TypedDecisionMode = 'shadow';

/**
 * The rollout gate of the `task_routing.output_type` decision point (#4867).
 *
 * Capped at shadow (release-blocker follow-up, epic #4863): Jev still
 * computes and records the output-type answer next to the keyword table's,
 * but nothing reads it back into `TaskRoutingService.resolveOutputType` — the
 * `mode !== 'live'` guard there always takes the keyword path because `live`
 * cannot come out of this function any more. Hand-built configuration cannot
 * bypass that boundary; it is the same idiom
 * `resolveUntrustedContentDecisionConfig` uses for the gate.
 *
 * One function, one file, both reads in one place: #4912 replaces every
 * per-decision-point env resolver like this one with a settings service, and
 * the smaller this surface is the smaller that migration is. Do not grow it.
 */
export function resolveTaskRoutingDecisionRollout(
  configService: ConfigService,
): TypedDecisionRolloutSettings {
  const rawMode = String(
    configService.get('TASK_ROUTING_DECISION_MODE') ?? '',
  ).trim();
  const mode: TypedDecisionMode = rawMode === 'off' ? 'off' : 'shadow';

  const minConfidence = Number(
    configService.get('TASK_ROUTING_MIN_CONFIDENCE'),
  );

  return {
    minConfidence:
      Number.isFinite(minConfidence) && minConfidence >= 0 && minConfidence <= 1
        ? minConfidence
        : TASK_ROUTING_DEFAULT_MIN_CONFIDENCE,
    mode,
  };
}
