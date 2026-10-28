import type { AgentProposedPlan } from '@genfeedai/agent/models/agent-chat.model';

export interface ProposedPlanStep {
  /** Stable within the plan: its position among all steps, blanks included. */
  id: string;
  label: string;
}

/** The steps a plan lists, in order; blank or non-text steps drop out. */
export function getProposedPlanSteps(
  plan: AgentProposedPlan,
): ProposedPlanStep[] {
  return (plan.steps ?? []).flatMap((step, position) => {
    const label = typeof step.step === 'string' ? step.step.trim() : '';
    return label ? [{ id: `${plan.id}:step:${position}`, label }] : [];
  });
}

/** Whether the plan carries anything a reviewer can read. */
export function hasProposedPlanBody(plan: AgentProposedPlan): boolean {
  return (
    Boolean(plan.content?.trim()) ||
    Boolean(plan.explanation?.trim()) ||
    getProposedPlanSteps(plan).length > 0
  );
}
