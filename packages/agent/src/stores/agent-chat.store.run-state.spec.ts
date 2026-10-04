import {
  selectActiveRun,
  selectIsGenerating,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

function state() {
  return useAgentChatStore.getState();
}

describe('agent-chat.store per-thread run state', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    state().setActiveThread('thread-a');
  });

  it('projects a transition onto the visible thread and its selectors', () => {
    state().transitionRun('thread-a', {
      runId: 'run-a',
      startedAt: '2026-10-04T10:00:00.000Z',
      type: 'begin',
    });
    state().transitionRun('thread-a', {
      isGenerating: true,
      type: 'generating',
    });

    expect(selectActiveRun(state())).toEqual({
      isGenerating: true,
      runId: 'run-a',
      startedAt: '2026-10-04T10:00:00.000Z',
      status: 'running',
    });
    expect(selectIsGenerating(state())).toBe(true);
    expect(state().activeRunId).toBe('run-a');
    expect(state().activeRunStatus).toBe('running');
    expect(state().isGenerating).toBe(true);
    expect(state().runStartedAt).toBe('2026-10-04T10:00:00.000Z');
  });

  it('keeps the visible fields idle after a thread switch mid-run, and keeps the left thread run', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);

    state().setActiveThread('thread-b');

    expect(state().activeRunId).toBeNull();
    expect(state().activeRunStatus).toBe('idle');
    expect(state().isGenerating).toBe(true);
    expect(selectActiveRun(state()).status).toBe('idle');
    expect(state().runsByThread['thread-a']).toMatchObject({
      runId: 'run-a',
      status: 'running',
    });
  });

  it('settles a background thread without touching the visible thread', () => {
    state().setActiveRun('run-a');
    state().setActiveThread('thread-b');
    state().setActiveRun('run-b');

    state().transitionRun('thread-a', { type: 'complete' });

    expect(state().runsByThread['thread-a']).toMatchObject({
      runId: null,
      status: 'completed',
    });
    expect(state().activeRunId).toBe('run-b');
    expect(state().activeRunStatus).toBe('running');
    expect(selectActiveRun(state()).runId).toBe('run-b');
  });

  it('walks cancel: cancelling survives a stream reset, then settles', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);

    state().transitionRun('thread-a', { status: 'cancelling', type: 'status' });
    state().resetStreamState();
    expect(state().activeRunStatus).toBe('cancelling');

    state().transitionRun('thread-a', { status: 'cancelled', type: 'status' });
    state().transitionRun('thread-a', {
      isGenerating: false,
      type: 'generating',
    });
    expect(selectActiveRun(state())).toMatchObject({
      isGenerating: false,
      status: 'cancelled',
    });
    expect(state().activeRunStatus).toBe('cancelled');
  });

  it('settles a stream reset to idle when not cancelling', () => {
    state().setActiveRun('run-a');
    state().resetStreamState();
    expect(state().activeRunStatus).toBe('idle');
    expect(selectActiveRun(state()).status).toBe('idle');
  });

  it('fails a live run on error and clears generating, but leaves a settled run', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);
    state().setError('Out of credits');
    expect(selectActiveRun(state())).toMatchObject({
      isGenerating: false,
      status: 'failed',
    });

    state().transitionRun('thread-a', { type: 'reset' });
    state().transitionRun('thread-a', { status: 'completed', type: 'status' });
    state().setError('later');
    expect(state().activeRunStatus).toBe('completed');
  });

  it('resets every field together on clearStaleActiveRun and resetActiveConversationState', () => {
    state().setActiveRun('run-a', { startedAt: 'x' });
    state().setIsGenerating(true);
    state().clearStaleActiveRun();
    expect(selectActiveRun(state())).toEqual({
      isGenerating: false,
      runId: null,
      startedAt: null,
      status: 'idle',
    });
    expect(state().runStartedAt).toBeNull();

    state().setActiveRun('run-b');
    state().setIsGenerating(true);
    state().resetActiveConversationState();
    expect(selectIsGenerating(state())).toBe(false);
    expect(state().activeRunId).toBeNull();
  });

  it('folds a direct write of the compatibility fields back into the record', () => {
    useAgentChatStore.setState({
      activeRunId: 'run-x',
      activeRunStatus: 'awaiting_input',
    });
    expect(selectActiveRun(state())).toMatchObject({
      runId: 'run-x',
      status: 'awaiting_input',
    });
  });

  it('mirrors the open thread run status into its summary', () => {
    state().upsertThread({
      contextVersion: 1,
      id: 'thread-a',
      status: AgentThreadStatus.ACTIVE,
      title: 'A',
    });
    state().setActiveRun('run-a');
    expect(state().threads[0]?.runStatus).toBe('running');
  });

  it('carries the draft thread record onto the thread it becomes', () => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    state().setActiveRun('run-new');
    state().setActiveThread('thread-new');
    expect(selectActiveRun(state())).toMatchObject({
      runId: 'run-new',
      status: 'running',
    });
  });
});
