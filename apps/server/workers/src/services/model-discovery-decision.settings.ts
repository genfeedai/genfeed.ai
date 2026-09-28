import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';
import type { IModelDiscoveryDecisionSettings } from '@workers/interfaces/model-discovery.interface';

/**
 * Rollout gate for the model-discovery category decision (#4869, epic #4863),
 * the `model_discovery_decision` PostHog flag (#5468).
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

export function resolveModelDiscoveryDecisionSettings(
  settings: IPlatformFeatureSettings,
): IModelDiscoveryDecisionSettings {
  return {
    minConfidence: settings.modelDiscoveryMinConfidence,
    mode: settings.modelDiscoveryDecisionMode,
  };
}
