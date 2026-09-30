import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAgentWorkflowStore } from '../store';

import { useAgentWorkflow } from './useAgentWorkflow';

function resetStore(): void {
  useAgentWorkflowStore.setState({
    approaches: [],
    isLocked: false,
    messages: [],
    phase: 'exploring',
    questions: [],
    selectedApproachId: null,
    transitions: [],
    verificationEvidence: [],
  });
}

describe('useAgentWorkflow', () => {
  beforeEach(() => {
    resetStore();
  });

  it('exposes the current workflow state', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    expect(result.current.phase).toBe('exploring');
    expect(result.current.questions).toEqual([]);
    expect(result.current.approaches).toEqual([]);
    expect(result.current.isLocked).toBe(false);
    expect(typeof result.current.bindApi).toBe('function');
  });

  it('agentAsk records the question and an agent message', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.agentAsk({
        text: 'Which platform first?',
        type: 'free_text',
      });
    });

    expect(result.current.questions).toHaveLength(1);
    expect(result.current.questions[0]?.text).toBe('Which platform first?');
    expect(result.current.messages.at(-1)).toMatchObject({
      content: 'Which platform first?',
      role: 'agent',
    });
  });

  it('agentPropose flags the recommendation in its message', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.agentPropose({
        description: 'Reuse it',
        recommended: true,
        title: 'Extend the scheduler',
        tradeoffs: { cons: [], pros: [] },
      });
      result.current.agentPropose({
        description: 'Start over',
        recommended: false,
        title: 'Rewrite',
        tradeoffs: { cons: [], pros: [] },
      });
    });

    expect(result.current.approaches).toHaveLength(2);
    expect(result.current.messages[0]?.content).toContain('(recommended)');
    expect(result.current.messages[1]?.content).not.toContain('(recommended)');
  });

  it('agentSubmitEvidence reports pass and fail outcomes', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.agentSubmitEvidence({
        content: 'ok',
        passed: true,
        title: 'Unit tests',
        type: 'test_result',
      });
      result.current.agentSubmitEvidence({
        content: 'bad',
        passed: false,
        title: 'Lint',
        type: 'log',
      });
    });

    expect(result.current.verificationEvidence).toHaveLength(2);
    expect(result.current.messages[0]?.content).toBe(
      'Verification: Unit tests — passed',
    );
    expect(result.current.messages[1]?.content).toBe(
      'Verification: Lint — failed',
    );
  });

  it('answers a question and unblocks the clarifying gate', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.agentAsk({ text: 'Which platform?', type: 'free_text' });
    });

    const questionId = result.current.questions[0]?.id ?? '';

    act(() => {
      result.current.answerQuestion(questionId, 'Instagram');
    });

    expect(result.current.questions[0]?.answer).toBe('Instagram');
  });

  it('forwards core transitions to the store', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.forceAdvance();
    });
    expect(result.current.phase).toBe('clarifying');

    act(() => {
      result.current.rollback('exploring');
    });
    expect(result.current.phase).toBe('exploring');

    act(() => {
      result.current.setLocked(true);
    });
    expect(result.current.isLocked).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.phase).toBe('exploring');
    expect(result.current.isLocked).toBe(false);
    expect(result.current.transitions).toEqual([]);
  });

  it('selects and approves an approach', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.addApproach({
        description: 'Reuse it',
        recommended: true,
        title: 'Extend the scheduler',
        tradeoffs: { cons: [], pros: [] },
      });
    });

    const approachId = result.current.approaches[0]?.id ?? '';

    act(() => {
      result.current.selectApproach(approachId);
    });
    expect(result.current.selectedApproachId).toBe(approachId);

    act(() => {
      useAgentWorkflowStore.setState({ phase: 'awaiting_approval' });
      result.current.approveApproach();
    });
    expect(result.current.phase).toBe('implementing');
  });

  it('appends free-form messages', () => {
    const { result } = renderHook(() => useAgentWorkflow());

    act(() => {
      result.current.addMessage('user', 'Sounds good');
    });

    expect(result.current.messages.at(-1)).toMatchObject({
      content: 'Sounds good',
      role: 'user',
    });
  });
});
