import {
  type AgentWorkflowState,
  WORKFLOW_PHASES,
  type WorkflowPhase,
} from './types';

/**
 * Valid forward transitions. Each phase can only advance to the next phase.
 */
const FORWARD_TRANSITIONS: Record<WorkflowPhase, WorkflowPhase | null> = {
  awaiting_approval: 'implementing',
  clarifying: 'proposing',
  complete: null,
  exploring: 'clarifying',
  implementing: 'verifying',
  proposing: 'awaiting_approval',
  verifying: 'complete',
};

export function isValidRollback(
  from: WorkflowPhase,
  to: WorkflowPhase,
): boolean {
  const fromIndex = WORKFLOW_PHASES.indexOf(from);
  const toIndex = WORKFLOW_PHASES.indexOf(to);
  return toIndex < fromIndex && toIndex >= 0;
}

export function getNextPhase(current: WorkflowPhase): WorkflowPhase | null {
  return FORWARD_TRANSITIONS[current];
}

export function getPhaseIndex(phase: WorkflowPhase): number {
  return WORKFLOW_PHASES.indexOf(phase);
}

/**
 * This is a pure function that inspects state without mutating it.
 */
export function isGateMet(state: AgentWorkflowState): boolean {
  if (state.isLocked) return false;

  switch (state.phase) {
    case 'exploring':
      return true;

    case 'clarifying':
      return (
        state.questions.length > 0 &&
        state.questions.every((q) => q.answer !== undefined && q.answer !== '')
      );

    case 'proposing':
      return state.approaches.length >= 2;

    case 'awaiting_approval':
      return state.selectedApproachId !== null;

    case 'implementing':
      return true;

    case 'verifying':
      return (
        state.verificationEvidence.length > 0 &&
        state.verificationEvidence.every((e) => e.passed)
      );

    case 'complete':
      return false;
  }
}

export function createInitialState(): AgentWorkflowState {
  return {
    approaches: [],
    isLocked: false,
    messages: [],
    phase: 'exploring',
    questions: [],
    selectedApproachId: null,
    transitions: [],
    verificationEvidence: [],
  };
}
