import {
  AGENT_WORKFLOW_PHASES,
  type AgentWorkflowDocumentShape,
  type AgentWorkflowGateStatus,
  type AgentWorkflowPhase,
} from '@api/workflows/agent-workflows.types';

const NEXT_PHASE: Record<AgentWorkflowPhase, AgentWorkflowPhase | null> = {
  awaiting_approval: 'implementing',
  clarifying: 'proposing',
  complete: null,
  exploring: 'clarifying',
  implementing: 'verifying',
  proposing: 'awaiting_approval',
  verifying: 'complete',
};

export function getNextAgentWorkflowPhase(
  phase: AgentWorkflowPhase,
): AgentWorkflowPhase | null {
  return NEXT_PHASE[phase];
}

export function isValidAgentWorkflowRollback(
  from: AgentWorkflowPhase,
  to: AgentWorkflowPhase,
): boolean {
  const fromIndex = AGENT_WORKFLOW_PHASES.indexOf(from);
  const toIndex = AGENT_WORKFLOW_PHASES.indexOf(to);
  return toIndex >= 0 && toIndex < fromIndex;
}

export function isAgentWorkflowGateMetForPhase(
  phase: AgentWorkflowPhase,
  state: AgentWorkflowDocumentShape,
): boolean {
  if (state.isLocked) {
    return false;
  }

  switch (phase) {
    case 'exploring':
      return true;
    case 'clarifying':
      return (
        state.questions.length > 0 &&
        state.questions.every(
          (question) =>
            question.answer !== undefined && question.answer.trim() !== '',
        )
      );
    case 'proposing':
      return state.approaches.length >= 2;
    case 'awaiting_approval':
      return Boolean(state.selectedApproachId);
    case 'implementing':
      return true;
    case 'verifying':
      return (
        state.verificationEvidence.length > 0 &&
        state.verificationEvidence.every((evidence) => evidence.passed)
      );
    case 'complete':
      return false;
  }
}

export function computeAgentWorkflowGateStatus(
  state: AgentWorkflowDocumentShape,
): AgentWorkflowGateStatus {
  return AGENT_WORKFLOW_PHASES.reduce<AgentWorkflowGateStatus>(
    (accumulator, phase) => {
      accumulator[phase] = isAgentWorkflowGateMetForPhase(phase, state);
      return accumulator;
    },
    {
      awaiting_approval: false,
      clarifying: false,
      complete: false,
      exploring: false,
      implementing: false,
      proposing: false,
      verifying: false,
    },
  );
}
