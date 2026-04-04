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

/**
 * Check if a phase transition is a valid rollback (going backward).
 */
export function isValidRollback(
  from: WorkflowPhase,
  to: WorkflowPhase,
): boolean {
  const fromIndex = WORKFLOW_PHASES.indexOf(from);
  const toIndex = WORKFLOW_PHASES.indexOf(to);
  return toIndex < fromIndex && toIndex >= 0;
}

/**
 * Get the next phase in the sequence, or null if at the end.
 */
export function getNextPhase(current: WorkflowPhase): WorkflowPhase | null {
  return FORWARD_TRANSITIONS[current];
}

/**
 * Get the phase index (0-based).
 */
export function getPhaseIndex(phase: WorkflowPhase): number {
  return WORKFLOW_PHASES.indexOf(phase);
}

/**
 * Check if the gate condition is met for advancing from the current phase.
 * This is a pure function that inspects state without mutating it.
 */
export function isGateMet(state: AgentWorkflowState): boolean {
  if (state.isLocked) return false;

  switch (state.phase) {
    case 'exploring':
      // Agent signals readiness — always passable (agent calls advance)
      return true;

    case 'clarifying':
      // All questions must be answered
      return (
        state.questions.length > 0 &&
        state.questions.every((q) => q.answer !== undefined && q.answer !== '')
      );

    case 'proposing':
      // At least 2 approaches submitted
      return state.approaches.length >= 2;

    case 'awaiting_approval':
      // User must have selected and approved an approach
      return state.selectedApproachId !== null;

    case 'implementing':
      // Agent signals implementation complete
      return true;

    case 'verifying':
      // All evidence must be present and passing
      return (
        state.verificationEvidence.length > 0 &&
        state.verificationEvidence.every((e) => e.passed)
      );

    case 'complete':
      // Terminal state
      return false;
  }
}

/**
 * Initial state for a new agent workflow.
 */
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
