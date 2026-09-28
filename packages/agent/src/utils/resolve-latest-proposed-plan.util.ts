import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';

/** Ids the agent mints for a drafted plan: `plan-<creation time in ms>`. */
const PLAN_ID_TIMESTAMP_PATTERN = /^plan-(\d{10,})$/;

const PLAN_STATUS_RANK: Readonly<Record<string, number>> = {
  approved: 2,
  awaiting_approval: 1,
  draft: 0,
  superseded: 3,
};

function toTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

/**
 * When a plan was first drafted. The id carries it and never changes; a
 * drafted plan reaches the client with only that id when it was persisted
 * before plans were timestamped, so it is read first. `createdAt` is the
 * fallback for other id shapes.
 */
function getPlanCreatedAt(plan: AgentProposedPlan): number | null {
  const idTimestamp = PLAN_ID_TIMESTAMP_PATTERN.exec(plan.id ?? '')?.[1];
  return idTimestamp ? Number(idTimestamp) : toTimestamp(plan.createdAt);
}

function getStatusRank(plan: AgentProposedPlan): number | null {
  return plan.status ? (PLAN_STATUS_RANK[plan.status] ?? null) : null;
}

/**
 * Whether `incoming` is older than `current` and must not replace it. `null`
 * when the two cannot be ordered, so the caller falls back to arrival order.
 */
function isStale(
  current: AgentProposedPlan,
  incoming: AgentProposedPlan,
): boolean | null {
  if (current.id === incoming.id) {
    const currentUpdatedAt = toTimestamp(current.updatedAt);
    const incomingUpdatedAt = toTimestamp(incoming.updatedAt);
    if (currentUpdatedAt !== null && incomingUpdatedAt !== null) {
      return incomingUpdatedAt < currentUpdatedAt;
    }
    // An untimestamped copy of the same plan: the review lifecycle only moves
    // forward, so a copy that is earlier in it (the plan before its approval)
    // is the stale one.
    const currentRank = getStatusRank(current);
    const incomingRank = getStatusRank(incoming);
    return currentRank !== null && incomingRank !== null
      ? incomingRank < currentRank
      : null;
  }

  const currentCreatedAt = getPlanCreatedAt(current);
  const incomingCreatedAt = getPlanCreatedAt(incoming);
  return currentCreatedAt !== null && incomingCreatedAt !== null
    ? incomingCreatedAt < currentCreatedAt
    : null;
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
 * - a different plan is applied when it was drafted no earlier than the
 *   current one (ordered by the drafting time in its id, else `createdAt`);
 * - the same plan is applied when its `updatedAt` is not older, so an approval
 *   lands on the plan it approved and a stale copy never rolls it back; with
 *   no `updatedAt` to compare, the copy further along its review lifecycle wins.
 *
 * Plans that cannot be ordered by any of that fall back to arrival order: the
 * incoming plan wins.
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

  return isStale(current, incoming) === true ? current : incoming;
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
