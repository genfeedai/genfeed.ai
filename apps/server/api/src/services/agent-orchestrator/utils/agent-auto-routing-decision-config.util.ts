import type {
  IPlatformFeatureSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';

/**
 * Rollout gate for agent auto-routing, the `agent_auto_routing` PostHog flag (#5468).
 *
 * The tier decision no longer calls Jev (release-blocker follow-up to #4865,
 * epic #4863): the candidate key is resolved deterministically from the
 * Admin-configured model registry (`AgentChatModelRegistryService`), the same
 * "Admin TEXT default" resolution #5167 uses elsewhere. `off` keeps today's
 * gateway auto-router untouched; `shadow` computes and logs the candidate
 * without dispatching it; `live` dispatches it. There is no confidence to
 * gate on any more, so this resolver only reads the mode.
 */
export interface AgentAutoRoutingDecisionConfig {
  mode: TypedDecisionMode;
}

export function resolveAgentAutoRoutingDecisionConfig(
  settings: IPlatformFeatureSettings,
): AgentAutoRoutingDecisionConfig {
  return { mode: settings.agentAutoRoutingDecisionMode };
}
