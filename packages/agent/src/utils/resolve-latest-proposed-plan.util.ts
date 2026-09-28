import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * The plan the thread should show once `incoming` arrives.
 *
 * A run's reply carries the plan it acted on, and it can land after a newer
 * plan already replaced that one: an approval of plan A that outlives the
 * foreground window finishes after the agent proposed plan B. Applying its
 * reply blindly would put the older, approved plan back over B. So an update
 * is applied only when it is not older than the plan in state:
 *
 * - the same plan (`id`) is applied when its `updatedAt` is not older, so an
 *   approval still lands on the plan it approved and a stale copy of it never
 *   rolls the approval back;
 * - a different plan is applied when it was created no earlier than the
 *   current one; a plan created earlier is a stale run's and is ignored.
 *
 * A timestamp that is missing or unparseable never blocks an update.
 */
export function resolveLatestProposedPlan(
  current: AgentProposedPlan | null,
  incoming: AgentProposedPlan | null | undefined,
): AgentProposedPlan | null {
  if (!incoming) {
    return current;
  }
  if (!current) {
    return incoming;
  }

  const isSamePlan = current.id === incoming.id;
  const currentAt = toTimestamp(
    isSamePlan ? current.updatedAt : current.createdAt,
  );
  const incomingAt = toTimestamp(
    isSamePlan ? incoming.updatedAt : incoming.createdAt,
  );

  if (currentAt !== null && incomingAt !== null && incomingAt < currentAt) {
    return current;
  }
  return incoming;
}

/** The newest plan across an ordered list of messages' `proposedPlan`s. */
export function deriveLatestProposedPlan(
  plans: ReadonlyArray<AgentProposedPlan | null | undefined>,
): AgentProposedPlan | null {
  return plans.reduce<AgentProposedPlan | null>(
    (latest, plan) => resolveLatestProposedPlan(latest, plan),
    null,
  );
}
