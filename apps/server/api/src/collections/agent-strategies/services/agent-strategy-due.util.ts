/**
 * Shared "is this agent strategy due to run right now" predicate.
 *
 * Used by `AgentAutopilotWorkflowService` (the `agent.autopilot.proactive`
 * workflow's own discovery step, per-org) and by
 * `PlatformWorkflowSchedulesService` (the platform cron sweep that decides
 * whether an org's dispatcher workflow is worth enqueuing at all — #5162 /
 * #4961 AC-1). Both must agree on what "due" means; a single shared function
 * keeps them from drifting.
 */
export type AgentStrategyDueConfig = {
  consecutiveFailures?: number;
  nextRunAt?: string;
  requiresManualReactivation?: boolean;
};

/**
 * A strategy is paused after this many consecutive execution failures until
 * it is manually reactivated. Mirrors `MAX_CONSECUTIVE_FAILURES` in
 * `agent-autopilot-workflow.service.ts`.
 */
export const AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES = 5;

export function isAgentStrategyDue(
  config: AgentStrategyDueConfig,
  now: Date,
): boolean {
  const consecutiveFailures = config.consecutiveFailures ?? 0;
  const requiresManualReactivation = config.requiresManualReactivation ?? false;
  const nextRunAt = parseDate(config.nextRunAt);

  return (
    consecutiveFailures < AGENT_STRATEGY_MAX_CONSECUTIVE_FAILURES &&
    !requiresManualReactivation &&
    (!nextRunAt || nextRunAt <= now)
  );
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' && !(value instanceof Date)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
