import { useCallback } from 'react';
import { useAgentWorkflowStore } from '../store';
import type { Approach, Evidence, Question } from '../types';

/**
 * Convenience hook that bundles the most common agent workflow operations.
 * Use this in consumer components instead of importing the store directly.
 */
export function useAgentWorkflow() {
  const phase = useAgentWorkflowStore((s) => s.phase);
  const isLocked = useAgentWorkflowStore((s) => s.isLocked);
  const questions = useAgentWorkflowStore((s) => s.questions);
  const approaches = useAgentWorkflowStore((s) => s.approaches);
  const selectedApproachId = useAgentWorkflowStore((s) => s.selectedApproachId);
  const verificationEvidence = useAgentWorkflowStore(
    (s) => s.verificationEvidence,
  );
  const transitions = useAgentWorkflowStore((s) => s.transitions);
  const messages = useAgentWorkflowStore((s) => s.messages);

  const advance = useAgentWorkflowStore((s) => s.advance);
  const forceAdvance = useAgentWorkflowStore((s) => s.forceAdvance);
  const rollback = useAgentWorkflowStore((s) => s.rollback);
  const reset = useAgentWorkflowStore((s) => s.reset);
  const addQuestion = useAgentWorkflowStore((s) => s.addQuestion);
  const answerQuestion = useAgentWorkflowStore((s) => s.answerQuestion);
  const addApproach = useAgentWorkflowStore((s) => s.addApproach);
  const selectApproach = useAgentWorkflowStore((s) => s.selectApproach);
  const approveApproach = useAgentWorkflowStore((s) => s.approveApproach);
  const addEvidence = useAgentWorkflowStore((s) => s.addEvidence);
  const addMessage = useAgentWorkflowStore((s) => s.addMessage);
  const setLocked = useAgentWorkflowStore((s) => s.setLocked);
  const canAdvance = useAgentWorkflowStore((s) => s.canAdvance());
  const bindApi = useAgentWorkflowStore((s) => s.bindApi);

  // Agent-facing convenience methods
  const agentAsk = useCallback(
    (question: Omit<Question, 'id'>) => {
      addQuestion(question);
      addMessage('agent', question.text);
    },
    [addQuestion, addMessage],
  );

  const agentPropose = useCallback(
    (approach: Omit<Approach, 'id'>) => {
      addApproach(approach);
      addMessage(
        'agent',
        `Proposed: "${approach.title}" ${approach.recommended ? '(recommended)' : ''}`,
      );
    },
    [addApproach, addMessage],
  );

  const agentSubmitEvidence = useCallback(
    (evidence: Omit<Evidence, 'id'>) => {
      addEvidence(evidence);
      addMessage(
        'agent',
        `Verification: ${evidence.title} — ${evidence.passed ? 'passed' : 'failed'}`,
      );
    },
    [addEvidence, addMessage],
  );

  return {
    addApproach,
    addEvidence,
    addMessage,

    // Phase-specific actions
    addQuestion,

    // Core actions
    advance,

    // Agent convenience methods
    agentAsk,
    agentPropose,
    agentSubmitEvidence,
    answerQuestion,
    approaches,
    approveApproach,

    // API binding
    bindApi,
    canAdvance,
    forceAdvance,
    isLocked,
    messages,
    // State
    phase,
    questions,
    reset,
    rollback,
    selectApproach,
    selectedApproachId,
    setLocked,
    transitions,
    verificationEvidence,
  };
}
