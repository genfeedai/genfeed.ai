import type { TypedDecisionMode } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/**
 * Rollout gate for agent auto-routing.
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

function toMode(value: unknown): TypedDecisionMode {
  return value === 'live' || value === 'shadow' ? value : 'off';
}

export function resolveAgentAutoRoutingDecisionConfig(
  configService: Pick<ConfigService, 'get'>,
): AgentAutoRoutingDecisionConfig {
  return {
    mode: toMode(configService.get('AGENT_AUTO_ROUTING_DECISION_MODE')),
  };
}
