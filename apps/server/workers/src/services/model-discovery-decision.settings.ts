import type { TypedDecisionMode } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@workers/config/config.service';
import type { IModelDiscoveryDecisionSettings } from '@workers/interfaces/model-discovery.interface';

/**
 * Rollout gate for the model-discovery category decision (#4869, epic #4863).
 *
 * Deliberately one function in one file: #4912 replaces every per-decision
 * env-var resolver with a settings service, and a single call site is a single
 * edit when it lands.
 */

/**
 * Stable telemetry key. #4874 queries shadow-mode agreement by it, so it must
 * never change once a shadow run has been recorded against it.
 */
export const MODEL_DISCOVERY_CATEGORY_DECISION_POINT =
  'model_discovery.category';

/**
 * Discovery is a background cron, so the decision takes the epic's 2s async
 * budget rather than the 800ms default sized for the agent turn.
 */
export const MODEL_DISCOVERY_DECISION_TIMEOUT_MS = 2_000;

/** Matches MODEL_DISCOVERY_MIN_CONFIDENCE's Joi default. */
export const DEFAULT_MODEL_DISCOVERY_MIN_CONFIDENCE = 0.85;

const DECISION_MODES: readonly TypedDecisionMode[] = ['off', 'shadow', 'live'];

function isDecisionMode(value: unknown): value is TypedDecisionMode {
  return DECISION_MODES.some((mode) => mode === value);
}

/**
 * Anything unreadable resolves to the conservative pair — the keyword table
 * stays in control and nothing reaches the provider.
 */
export function resolveModelDiscoveryDecisionSettings(
  configService: ConfigService,
): IModelDiscoveryDecisionSettings {
  const mode = configService.get('MODEL_DISCOVERY_DECISION_MODE');
  const configured = Number(
    configService.get('MODEL_DISCOVERY_MIN_CONFIDENCE'),
  );

  return {
    minConfidence:
      Number.isFinite(configured) && configured >= 0 && configured <= 1
        ? configured
        : DEFAULT_MODEL_DISCOVERY_MIN_CONFIDENCE,
    mode: isDecisionMode(mode) ? mode : 'off',
  };
}
