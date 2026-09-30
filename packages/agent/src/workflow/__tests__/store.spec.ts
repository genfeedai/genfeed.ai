import { afterEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';

function getState() {
  return useAgentWorkflowStore.getState();
}

describe('AgentWorkflowStore', () => {
  afterEach(() => {
    getState().reset();
  });

  describe('phase transitions', () => {
    it('starts at exploring', () => {
      expect(getState().phase).toBe('exploring');
    });

    it('advances from exploring to clarifying', () => {
      const result = getState().advance('agent');
      expect(result).toBe(true);
      expect(getState().phase).toBe('clarifying');
      expect(getState().transitions).toHaveLength(1);
      expect(getState().transitions[0].trigger).toBe('gate_met');
    });

    it('blocks advance when gate not met', () => {
      getState().advance('agent'); // → clarifying
      // No questions added, gate not met
      const result = getState().advance('agent');
      expect(result).toBe(false);
      expect(getState().phase).toBe('clarifying');
    });

    it('force advance bypasses gates', () => {
      getState().advance('agent'); // → clarifying
      const result = getState().forceAdvance();
      expect(result).toBe(true);
      expect(getState().phase).toBe('proposing');
      expect(getState().transitions[1].trigger).toBe('force_advance');
    });

    it('rollback goes to earlier phase', () => {
      getState().advance('agent'); // → clarifying
      getState().forceAdvance(); // → proposing
      const result = getState().rollback('exploring');
      expect(result).toBe(true);
      expect(getState().phase).toBe('exploring');
      expect(getState().transitions[2].trigger).toBe('rollback');
    });

    it('rejects invalid rollback (forward)', () => {
      const result = getState().rollback('clarifying');
      expect(result).toBe(false);
    });

    it('blocks transitions when locked', () => {
      getState().setLocked(true);
      expect(getState().advance('agent')).toBe(false);
      expect(getState().forceAdvance()).toBe(false);
    });
  });

  describe('clarifying phase', () => {
    it('adds and answers questions', () => {
      getState().addQuestion({
        options: ['React', 'Vue', 'Svelte'],
        text: 'What framework?',
        type: 'multiple_choice',
      });

      expect(getState().questions).toHaveLength(1);
      expect(getState().questions[0].answer).toBeUndefined();

      getState().answerQuestion(getState().questions[0].id, 'React');
      expect(getState().questions[0].answer).toBe('React');
    });

    it('getUnansweredQuestions filters correctly', () => {
      getState().addQuestion({
        text: 'Q1',
        type: 'free_text',
      });
      getState().addQuestion({
        text: 'Q2',
        type: 'free_text',
      });

      expect(getState().getUnansweredQuestions()).toHaveLength(2);

      getState().answerQuestion(getState().questions[0].id, 'A1');
      expect(getState().getUnansweredQuestions()).toHaveLength(1);
    });
  });

  describe('proposing phase', () => {
    it('adds and removes approaches', () => {
      getState().addApproach({
        description: 'Desc A',
        recommended: true,
        title: 'Approach A',
        tradeoffs: { cons: ['complex'], pros: ['fast'] },
      });

      expect(getState().approaches).toHaveLength(1);

      getState().removeApproach(getState().approaches[0].id);
      expect(getState().approaches).toHaveLength(0);
    });

    it('clears selectedApproachId when removing selected approach', () => {
      getState().addApproach({
        description: 'D',
        recommended: false,
        title: 'A',
        tradeoffs: { cons: [], pros: [] },
      });
      const id = getState().approaches[0].id;
      getState().selectApproach(id);
      expect(getState().selectedApproachId).toBe(id);

      getState().removeApproach(id);
      expect(getState().selectedApproachId).toBeNull();
    });
  });

  describe('approval flow', () => {
    it('full flow: exploring → clarifying → proposing → approval → implementing', () => {
      // Explore
      getState().advance('agent'); // → clarifying

      // Clarify
      getState().addQuestion({ text: 'Q1', type: 'free_text' });
      getState().answerQuestion(getState().questions[0].id, 'A1');
      getState().advance('agent'); // → proposing

      // Propose
      const approach = {
        description: 'D',
        recommended: false,
        title: 'A',
        tradeoffs: { cons: ['c'], pros: ['p'] },
      };
      getState().addApproach(approach);
      getState().addApproach({ ...approach, title: 'B' });
      getState().advance('agent'); // → awaiting_approval

      // Approve
      getState().selectApproach(getState().approaches[0].id);
      const result = getState().approveApproach();
      expect(result).toBe(true);
      expect(getState().phase).toBe('implementing');
    });

    it('approveApproach fails without selection', () => {
      // Force to awaiting_approval
      getState().advance('agent');
      getState().forceAdvance();
      getState().forceAdvance();
      expect(getState().phase).toBe('awaiting_approval');

      expect(getState().approveApproach()).toBe(false);
    });
  });

  describe('verification', () => {
    it('adds evidence and checks all passed', () => {
      getState().addEvidence({
        content: '10/10 passed',
        passed: true,
        title: 'Unit tests',
        type: 'test_result',
      });
      getState().addEvidence({
        content: '+ new line',
        passed: true,
        title: 'Code diff',
        type: 'diff',
      });

      expect(getState().getAllEvidencePassed()).toBe(true);
    });

    it('reports not all passed when evidence fails', () => {
      getState().addEvidence({
        content: 'fail',
        passed: false,
        title: 'Tests',
        type: 'test_result',
      });

      expect(getState().getAllEvidencePassed()).toBe(false);
    });
  });

  describe('messages', () => {
    it('adds messages tagged with current phase', () => {
      getState().addMessage('agent', 'Reading context...');
      expect(getState().messages).toHaveLength(1);
      expect(getState().messages[0].phase).toBe('exploring');
      expect(getState().messages[0].role).toBe('agent');

      getState().advance('agent'); // → clarifying
      getState().addMessage('user', 'Answering question');
      expect(getState().messages[1].phase).toBe('clarifying');
    });

    it('getPhaseMessages filters correctly', () => {
      getState().addMessage('agent', 'Exploring');
      getState().advance('agent');
      getState().addMessage('agent', 'Asking');

      expect(getState().getPhaseMessages('exploring')).toHaveLength(1);
      expect(getState().getPhaseMessages('clarifying')).toHaveLength(1);
      expect(getState().getPhaseMessages('proposing')).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('resets to initial state', () => {
      getState().advance('agent');
      getState().addMessage('agent', 'test');
      getState().addQuestion({ text: 'Q', type: 'free_text' });

      getState().reset();

      expect(getState().phase).toBe('exploring');
      expect(getState().messages).toHaveLength(0);
      expect(getState().questions).toHaveLength(0);
      expect(getState().transitions).toHaveLength(0);
    });
  });
});
