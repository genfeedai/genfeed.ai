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
    expect(state().runsByThread['thread-a']).toEqual(selectActiveRun(state()));
  });

  it('shows the destination thread its own run on a switch, not the departing one', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);

    state().setActiveThread('thread-b');

    // Unknown destination: idle, and A's generating flag does not leak over.
    expect(selectActiveRun(state())).toEqual({
      isGenerating: false,
      runId: null,
      startedAt: null,
      status: 'idle',
    });
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
    expect(selectActiveRun(state())).toEqual({
      isGenerating: true,
      runId: 'run-a',
      startedAt: 'a-start',
      status: 'running',
    });

    state().setActiveThread('thread-b');
    expect(selectActiveRun(state())).toEqual({
      isGenerating: false,
      runId: 'run-b',
      startedAt: 'b-start',
      status: 'running',
    });
  });

  it('a new conversation never inherits the departing run', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);
    state().setActiveThread(null);
    expect(selectActiveRun(state()).runId).toBeNull();
    expect(selectIsGenerating(state())).toBe(false);
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
    expect(selectActiveRun(state())).toMatchObject({
      runId: 'run-b',
      status: 'running',
    });
  });

  it('walks cancel: cancelling survives a stream reset, then settles', () => {
    state().setActiveRun('run-a');
    state().setIsGenerating(true);

    state().transitionRun('thread-a', { status: 'cancelling', type: 'status' });
    state().resetStreamState();
    expect(selectActiveRun(state()).status).toBe('cancelling');

    state().transitionRun('thread-a', { status: 'cancelled', type: 'status' });
    state().transitionRun('thread-a', {
      isGenerating: false,
      type: 'generating',
    });
    expect(selectActiveRun(state())).toMatchObject({
      isGenerating: false,
      status: 'cancelled',
    });
  });

  it('settles a stream reset to idle when not cancelling', () => {
    state().setActiveRun('run-a');
    state().resetStreamState();
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
    expect(selectActiveRun(state()).status).toBe('completed');
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

    state().setActiveRun('run-b');
    state().setIsGenerating(true);
    state().resetActiveConversationState();
    expect(selectIsGenerating(state())).toBe(false);
    expect(selectActiveRun(state()).runId).toBeNull();
  });

  it('mirrors a direct write of the open thread record into its summary', () => {
    state().upsertThread(createThread('thread-a'));
    useAgentChatStore.setState((current) => ({
      runsByThread: {
        ...current.runsByThread,
        'thread-a': {
          isGenerating: false,
          runId: 'run-x',
          startedAt: null,
          status: 'running',
        },
      },
    }));
    expect(selectActiveRun(state())).toMatchObject({
      runId: 'run-x',
      status: 'running',
    });
    expect(state().threads[0]?.runStatus).toBe('running');
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
    expect(selectActiveRun(state()).status).toBe('running');
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
    expect(selectActiveRun(state())).toMatchObject({
      runId: 'run-b',
      status: 'running',
    });
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
