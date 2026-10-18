import type { AgentStrategyPerformanceSnapshot } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.types';
import type { AgentRunBriefTargets } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';

/** The proactive run's prompt and the targets it carries on the request. */
export interface ProactiveRunBrief {
  content: string;
  targets: AgentRunBriefTargets;
}

/**
 * Whether the agent's snapshot holds any collected measurement. A run with
 * none reports insufficient data rather than trends drawn from zeroes.
 */
export function hasMeasuredPerformance(
  snapshot: AgentStrategyPerformanceSnapshot,
): boolean {
  if (snapshot.sampling) {
    return snapshot.sampling.matchedMeasurements > 0;
  }
  return snapshot.impressions > 0 || snapshot.clicks > 0;
}
