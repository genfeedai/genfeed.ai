import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineEntry } from '@genfeedai/agent/utils/derive-timeline';

export interface PlanAnchors {
  /** The plan to show under each assistant message that first carried it. */
  byMessageId: ReadonlyMap<string, AgentProposedPlan>;
  /** The latest plan when no message in the timeline carries it. */
  trailing: AgentProposedPlan | null;
}

/**
 * A plan reads as part of the conversation: it sits under the assistant
 * message that proposed it, not above the whole transcript. Later messages
 * repeat the plan they acted on (an approval's reply carries the approved
 * copy), so each plan id is shown once, at its first message, with the status
 * it has now. A plan only the thread snapshot knows about (a reload before the
 * messages carry it) closes the timeline, which is where it was proposed.
 */
export function resolvePlanAnchors(
  timeline: readonly TimelineEntry[],
  latestPlan: AgentProposedPlan | null,
): PlanAnchors {
  const byMessageId = new Map<string, AgentProposedPlan>();
  const seenPlanIds = new Set<string>();

  for (const entry of timeline) {
    if (entry.kind !== 'assistant-message') {
      continue;
    }
    const plan = entry.message.metadata?.proposedPlan;
    if (!plan || seenPlanIds.has(plan.id)) {
      continue;
    }
    seenPlanIds.add(plan.id);
    byMessageId.set(entry.message.id, resolveShownPlan(plan, latestPlan));
  }

  return {
    byMessageId,
    trailing: latestPlan && !seenPlanIds.has(latestPlan.id) ? latestPlan : null,
  };
}

function resolveShownPlan(
  plan: AgentProposedPlan,
  latestPlan: AgentProposedPlan | null,
): AgentProposedPlan {
  if (!latestPlan) {
    return plan;
  }
  if (latestPlan.id === plan.id) {
    return latestPlan;
  }
  return { ...plan, awaitingApproval: false, status: 'superseded' };
}
