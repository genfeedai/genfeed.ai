import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  getNextPhase,
  getPhaseIndex,
  isGateMet,
  isValidRollback,
} from '../machine';
import type { AgentWorkflowState } from '../types';

function stateWith(overrides: Partial<AgentWorkflowState>): AgentWorkflowState {
  return { ...createInitialState(), ...overrides };
}

describe('machine', () => {
  describe('getNextPhase', () => {
    it('returns the next phase in sequence', () => {
      expect(getNextPhase('exploring')).toBe('clarifying');
      expect(getNextPhase('clarifying')).toBe('proposing');
      expect(getNextPhase('proposing')).toBe('awaiting_approval');
      expect(getNextPhase('awaiting_approval')).toBe('implementing');
      expect(getNextPhase('implementing')).toBe('verifying');
      expect(getNextPhase('verifying')).toBe('complete');
    });

    it('returns null for complete phase', () => {
      expect(getNextPhase('complete')).toBeNull();
    });
  });

  describe('getPhaseIndex', () => {
    it('returns correct indices', () => {
      expect(getPhaseIndex('exploring')).toBe(0);
      expect(getPhaseIndex('complete')).toBe(6);
    });
  });

  describe('isValidRollback', () => {
    it('allows rolling back to earlier phases', () => {
      expect(isValidRollback('proposing', 'exploring')).toBe(true);
      expect(isValidRollback('verifying', 'clarifying')).toBe(true);
    });

    it('rejects forward transitions', () => {
      expect(isValidRollback('exploring', 'clarifying')).toBe(false);
    });

    it('rejects same phase', () => {
      expect(isValidRollback('exploring', 'exploring')).toBe(false);
    });
  });

  describe('isGateMet', () => {
    it('exploring gate is always met', () => {
      expect(isGateMet(stateWith({ phase: 'exploring' }))).toBe(true);
    });

    it('clarifying gate requires all questions answered', () => {
      expect(
        isGateMet(
          stateWith({
            phase: 'clarifying',
            questions: [
              {
                answer: 'A1',
                id: '1',
                text: 'Q1',
                type: 'free_text',
              },
            ],
          }),
        ),
      ).toBe(true);
    });

    it('clarifying gate fails with unanswered questions', () => {
      expect(
        isGateMet(
          stateWith({
            phase: 'clarifying',
            questions: [{ id: '1', text: 'Q1', type: 'free_text' }],
          }),
        ),
      ).toBe(false);
    });

    it('clarifying gate fails with no questions', () => {
      expect(isGateMet(stateWith({ phase: 'clarifying', questions: [] }))).toBe(
        false,
      );
    });

    it('proposing gate requires at least 2 approaches', () => {
      const approach = {
        description: 'D',
        id: '1',
        recommended: false,
        title: 'A',
        tradeoffs: { cons: [], pros: [] },
      };
      expect(
        isGateMet(
          stateWith({
            approaches: [approach],
            phase: 'proposing',
          }),
        ),
      ).toBe(false);

      expect(
        isGateMet(
          stateWith({
            approaches: [approach, { ...approach, id: '2' }],
            phase: 'proposing',
          }),
        ),
      ).toBe(true);
    });

    it('awaiting_approval gate requires selected approach', () => {
      expect(
        isGateMet(
          stateWith({
            phase: 'awaiting_approval',
            selectedApproachId: null,
          }),
        ),
      ).toBe(false);

      expect(
        isGateMet(
          stateWith({
            phase: 'awaiting_approval',
            selectedApproachId: '1',
          }),
        ),
      ).toBe(true);
    });

    it('implementing gate is always met', () => {
      expect(isGateMet(stateWith({ phase: 'implementing' }))).toBe(true);
    });

    it('verifying gate requires all evidence passing', () => {
      expect(
        isGateMet(
          stateWith({
            phase: 'verifying',
            verificationEvidence: [
              {
                content: 'ok',
                id: '1',
                passed: true,
                title: 'Tests',
                type: 'test_result',
              },
            ],
          }),
        ),
      ).toBe(true);

      expect(
        isGateMet(
          stateWith({
            phase: 'verifying',
            verificationEvidence: [
              {
                content: 'fail',
                id: '1',
                passed: false,
                title: 'Tests',
                type: 'test_result',
              },
            ],
          }),
        ),
      ).toBe(false);
    });

    it('verifying gate fails with no evidence', () => {
      expect(
        isGateMet(stateWith({ phase: 'verifying', verificationEvidence: [] })),
      ).toBe(false);
    });

    it('complete gate is never met', () => {
      expect(isGateMet(stateWith({ phase: 'complete' }))).toBe(false);
    });

    it('locked state blocks all gates', () => {
      expect(isGateMet(stateWith({ isLocked: true, phase: 'exploring' }))).toBe(
        false,
      );
    });
  });
});
