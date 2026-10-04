import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import {
  selectActiveRun,
  selectIsGenerating,
  useAgentChatStore,
} from '@genfeedai/agent/stores/agent-chat.store';
import { AgentRuntimeState, AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

function createThread(id: string): AgentThread {
  return {
    contextVersion: 1,
    createdAt: '2026-10-04T10:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-10-04T10:00:00.000Z',
  };
}

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

  it('shows the destination thread its own run on a switch, not the departing one', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);

    state().setActiveThread('thread-b');

    // Unknown destination: idle, and A's generating flag does not leak over.
    expect(state().activeRunId).toBeNull();
    expect(state().activeRunStatus).toBe('idle');
    expect(state().isGenerating).toBe(false);
    expect(selectActiveRun(state()).status).toBe('idle');
    expect(state().runsByThread['thread-a']).toMatchObject({
      isGenerating: true,
      runId: 'run-a',
      status: 'running',
    });
  });

  it('switches between two concurrent runs without crossing their state', () => {
    state().setActiveRun('run-a', { startedAt: 'a-start' });
    state().setIsGenerating(true);
    state().setActiveThread('thread-b');
    state().setActiveRun('run-b', { startedAt: 'b-start' });

    state().setActiveThread('thread-a');
    expect(state()).toMatchObject({
      activeRunId: 'run-a',
      activeRunStatus: 'running',
      isGenerating: true,
      runStartedAt: 'a-start',
    });
    expect(selectActiveRun(state()).runId).toBe('run-a');

    state().setActiveThread('thread-b');
    expect(state()).toMatchObject({
      activeRunId: 'run-b',
      activeRunStatus: 'running',
      isGenerating: false,
      runStartedAt: 'b-start',
    });
  });

  it('a new conversation never inherits the departing run', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);
    state().setActiveThread(null);
    expect(state().activeRunId).toBeNull();
    expect(state().isGenerating).toBe(false);
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

  it('settles a background thread summary in the same update as its record', () => {
    for (const id of ['thread-a', 'thread-b']) {
      state().upsertThread(createThread(id));
    }
    state().setActiveRun('run-a');
    state().setActiveThread('thread-b');
    state().setActiveRun('run-b');
    const summaryA = () =>
      state().threads.find((thread) => thread.id === 'thread-a');
    expect(summaryA()?.runStatus).toBe('running');

    state().transitionRun('thread-a', { status: 'completed', type: 'status' });

    expect(summaryA()?.runStatus).toBe('completed');
    expect(
      state().threads.find((thread) => thread.id === 'thread-b')?.runStatus,
    ).toBe('running');
    expect(state().activeRunStatus).toBe('running');
  });

  it('applies a pushed status to a background thread without touching the visible run', () => {
    for (const id of ['thread-a', 'thread-b']) {
      state().upsertThread(createThread(id));
    }
    state().setActiveRun('run-a');
    state().setActiveThread('thread-b');
    state().setActiveRun('run-b');

    const result = state().applyThreadStatusPush({
      organizationId: 'org-1',
      pendingInputCount: 0,
      runStatus: 'completed',
      runtimeState: AgentRuntimeState.COMPLETED,
      sequence: 5,
      threadId: 'thread-a',
      timestamp: '2026-10-04T10:00:00.000Z',
      userId: 'user-1',
    });

    expect(result).toBe('applied');
    expect(
      state().threads.find((thread) => thread.id === 'thread-a')?.runStatus,
    ).toBe('completed');
    expect(state().activeRunId).toBe('run-b');
    expect(state().activeRunStatus).toBe('running');
  });

  it('mirrors the open thread run status into its summary', () => {
    state().upsertThread(createThread('thread-a'));
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
