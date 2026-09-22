import type { TypedDecisionMode } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/**
 * Rollout gate for agent auto-routing (#4865).
 *
 * One function, one file, both reads in one place: #4912 replaces every
 * per-decision-point env resolver in epic #4863 with a settings service, and
 * the smaller this surface is the smaller that migration is. Do not grow it.
 */

/** Matches AGENT_AUTO_ROUTING_MIN_CONFIDENCE's Joi default. */
export const AGENT_AUTO_ROUTING_DEFAULT_MIN_CONFIDENCE = 0.85;

export interface AgentAutoRoutingDecisionConfig {
  minConfidence: number;
  mode: TypedDecisionMode;
}

function toMode(value: unknown): TypedDecisionMode {
  return value === 'live' || value === 'shadow' ? value : 'off';
}

function toMinConfidence(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : AGENT_AUTO_ROUTING_DEFAULT_MIN_CONFIDENCE;
}

export function resolveAgentAutoRoutingDecisionConfig(
  configService: Pick<ConfigService, 'get'>,
): AgentAutoRoutingDecisionConfig {
  return {
    minConfidence: toMinConfidence(
      configService.get('AGENT_AUTO_ROUTING_MIN_CONFIDENCE'),
    ),
    mode: toMode(configService.get('AGENT_AUTO_ROUTING_DECISION_MODE')),
  };
}
