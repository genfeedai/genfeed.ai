import {
  computeAgentWorkflowGateStatus,
  getNextAgentWorkflowPhase,
  isAgentWorkflowGateMetForPhase,
  isValidAgentWorkflowRollback,
} from '@api/workflows/agent-workflows.machine';
import type { AgentWorkflowDocumentShape } from '@api/workflows/agent-workflows.types';

function createState(
  overrides: Partial<AgentWorkflowDocumentShape> = {},
): AgentWorkflowDocumentShape {
  return {
    approaches: [],
    currentPhase: 'exploring',
    isLocked: false,
    messages: [],
    questions: [],
    selectedApproachId: null,
    verificationEvidence: [],
    ...overrides,
  };
}

describe('agent-workflows.machine', () => {
  it('returns the next phase in sequence', () => {
    expect(getNextAgentWorkflowPhase('exploring')).toBe('clarifying');
    expect(getNextAgentWorkflowPhase('verifying')).toBe('complete');
    expect(getNextAgentWorkflowPhase('complete')).toBeNull();
  });

  it('validates rollback direction', () => {
    expect(isValidAgentWorkflowRollback('verifying', 'clarifying')).toBe(true);
    expect(isValidAgentWorkflowRollback('clarifying', 'verifying')).toBe(false);
  });

  it('requires answered questions in clarifying', () => {
    expect(
      isAgentWorkflowGateMetForPhase(
        'clarifying',
        createState({
          questions: [{ id: 'q1', text: 'Question?', type: 'free_text' }],
        }),
      ),
    ).toBe(false);

    expect(
      isAgentWorkflowGateMetForPhase(
        'clarifying',
        createState({
          questions: [
            {
              answer: 'Yes',
              id: 'q1',
              text: 'Question?',
              type: 'free_text',
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('requires two approaches in proposing', () => {
    expect(
      isAgentWorkflowGateMetForPhase(
        'proposing',
        createState({
          approaches: [
            {
              description: 'A',
              id: 'a1',
              recommended: true,
              title: 'Approach A',
              tradeoffs: { cons: [], pros: [] },
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('computes gate status for all phases', () => {
    expect(
      computeAgentWorkflowGateStatus(
        createState({
          approaches: [
            {
              description: 'A',
              id: 'a1',
              recommended: true,
              title: 'Approach A',
              tradeoffs: { cons: [], pros: [] },
            },
            {
              description: 'B',
              id: 'a2',
              recommended: false,
              title: 'Approach B',
              tradeoffs: { cons: [], pros: [] },
            },
          ],
          questions: [
            {
              answer: 'yes',
              id: 'q1',
              text: 'Question?',
              type: 'free_text',
            },
          ],
          selectedApproachId: 'a1',
          verificationEvidence: [
            {
              content: 'Tests passed',
              id: 'e1',
              passed: true,
              title: 'Vitest',
              type: 'test_result',
            },
          ],
        }),
      ),
    ).toEqual({
      awaiting_approval: true,
      clarifying: true,
      complete: false,
      exploring: true,
      implementing: true,
      proposing: true,
      verifying: true,
    });
  });
});
