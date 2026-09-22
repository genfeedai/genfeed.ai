import type {
  TypedDecisionMode,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/** Mirrors the Joi default of TASK_ROUTING_MIN_CONFIDENCE. */
export const TASK_ROUTING_DEFAULT_MIN_CONFIDENCE = 0.85;

/** Mirrors the Joi default of TASK_ROUTING_DECISION_MODE. */
export const TASK_ROUTING_DEFAULT_DECISION_MODE: TypedDecisionMode = 'off';

function isTypedDecisionMode(value: unknown): value is TypedDecisionMode {
  return value === 'off' || value === 'shadow' || value === 'live';
}

/**
 * The rollout gate of the `task_routing.output_type` decision point (#4867).
 *
 * One function, one file, two reads: #4912 replaces every per-decision-point
 * resolver like this one with a settings service, so nothing else belongs here.
 * Both values are Joi-validated at boot; the guards below only cover a config
 * service handed an unvalidated value (specs, self-host overrides).
 */
export function resolveTaskRoutingDecisionRollout(
  configService: ConfigService,
): TypedDecisionRolloutSettings {
  const mode = configService.get('TASK_ROUTING_DECISION_MODE');
  const minConfidence = Number(
    configService.get('TASK_ROUTING_MIN_CONFIDENCE'),
  );

  return {
    minConfidence:
      Number.isFinite(minConfidence) && minConfidence >= 0 && minConfidence <= 1
        ? minConfidence
        : TASK_ROUTING_DEFAULT_MIN_CONFIDENCE,
    mode: isTypedDecisionMode(mode) ? mode : TASK_ROUTING_DEFAULT_DECISION_MODE,
  };
}
