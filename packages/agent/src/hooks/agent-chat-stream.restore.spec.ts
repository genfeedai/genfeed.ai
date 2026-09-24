import { restoreThreadFromSnapshot } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import {
  createAgentStreamEntry,
  getAgentStreamRuntime,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function makeSnapshot(
  activeRun: AgentThreadSnapshot['activeRun'],
): AgentThreadSnapshot {
  return {
    activeRun,
    lastAssistantMessage: null,
    lastSequence: 1,
    latestProposedPlan: null,
    latestUiBlocks: null,
    memorySummaryRefs: [],
    pendingApprovals: [],
    pendingInputRequests: [],
    profileSnapshot: null,
    sessionBinding: null,
    source: null,
    threadId: 'thread-1',
    threadStatus: null,
    timeline: [],
    title: null,
  } as AgentThreadSnapshot;
}

function makeDeps(snapshot: AgentThreadSnapshot) {
  return {
    apiService: {
      getMessages: vi.fn().mockResolvedValue([]),
      getThreadSnapshot: vi.fn().mockResolvedValue(snapshot),
    },
    clearCompletionWatchdog: vi.fn(),
    clearPendingCompletionIfThread: vi.fn(),
    clearPendingInputRequest: vi.fn(),
    markStreamLive: vi.fn(),
    resetStreamState: vi.fn(),
    setActiveRun: vi.fn(),
    setError: vi.fn(),
    setLatestProposedPlan: vi.fn(),
    setMessages: vi.fn(),
    setPendingInputRequest: vi.fn(),
    setRunStartedAt: vi.fn(),
    setWorkEvents: vi.fn(),
    updateThreadSummary: vi.fn(),
  };
}

describe('restoreThreadFromSnapshot', () => {
  beforeEach(() => {
    resetAgentStreamRuntime();
    useAgentChatStore.setState({
      activeThreadId: 'thread-1',
      activeRunId: 'run-1',
      activeRunStatus: 'running',
      threads: [
        {
          id: 'thread-1',
          contextVersion: 1,
          createdAt: '2026-09-23T15:06:00.000Z',
          updatedAt: '2026-09-23T15:06:00.000Z',
          status: AgentThreadStatus.ACTIVE,
          runStatus: 'running',
        },
      ],
    });
  });

  it('adopts a running run as a live stream so the working row renders', async () => {
    const deps = makeDeps(
      makeSnapshot({
        runId: 'run-1',
        startedAt: '2026-09-23T15:06:00.000Z',
        status: 'running',
      }),
    );

    await restoreThreadFromSnapshot('thread-1', deps as never);

    expect(deps.setActiveRun).toHaveBeenCalledWith('run-1', {
      startedAt: '2026-09-23T15:06:00.000Z',
      status: 'running',
    });
    expect(deps.markStreamLive).toHaveBeenCalledOnce();
    expect(deps.resetStreamState).not.toHaveBeenCalled();
  });

  it('does not revive a stream for a thread without an active run', async () => {
    const deps = makeDeps(makeSnapshot(null));

    await restoreThreadFromSnapshot('thread-1', deps as never);

    expect(deps.markStreamLive).not.toHaveBeenCalled();
    expect(deps.resetStreamState).toHaveBeenCalledOnce();
  });
  it.each(
    (['completed', 'failed', 'cancelled'] as const).flatMap((terminal) =>
      [true, false].map((visible) => ({ terminal, visible })),
    ),
  )(
    'preserves $terminal state after a delayed snapshot, visible=$visible',
    async ({ terminal, visible }) => {
      const snapshot = makeSnapshot({
        runId: 'run-1',
        startedAt: null,
        status: 'running',
      });
      const deps = makeDeps(snapshot);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      deps.apiService.getThreadSnapshot.mockImplementation(async () => {
        await gate;
        return snapshot;
      });
      const restore = restoreThreadFromSnapshot('thread-1', deps as never);
      useAgentChatStore.setState({
        activeRunStatus: terminal,
        ...(visible
          ? {}
          : { activeThreadId: 'thread-2', activeRunId: 'run-2' }),
      });
      useAgentChatStore.getState().updateThread('thread-1', {
        runStatus: terminal,
        attentionState: 'updated',
        lastAssistantPreview: 'Fresh result',
      });
      release();
      await restore;
      expect(deps.updateThreadSummary).not.toHaveBeenCalled();
      expect(deps.setMessages).not.toHaveBeenCalled();
      expect(deps.setActiveRun).not.toHaveBeenCalled();
      expect(deps.markStreamLive).not.toHaveBeenCalled();
    },
  );

  it.each(['ownership', 'run identity'] as const)(
    'ignores a snapshot superseded by new $0',
    async (change) => {
      const snapshot = makeSnapshot({
        runId: 'run-1',
        startedAt: null,
        status: 'running',
      });
      const deps = makeDeps(snapshot);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      deps.apiService.getThreadSnapshot.mockImplementation(async () => {
        await gate;
        return snapshot;
      });
      const restore = restoreThreadFromSnapshot('thread-1', deps as never);
      if (change === 'ownership') getAgentStreamRuntime().ownerGeneration += 1;
      else useAgentChatStore.setState({ activeRunId: 'run-new' });
      release();
      await restore;
      expect(deps.updateThreadSummary).not.toHaveBeenCalled();
      expect(deps.setActiveRun).not.toHaveBeenCalled();
      expect(deps.markStreamLive).not.toHaveBeenCalled();
    },
  );

  it('restores a genuinely different run after an older run completed', async () => {
    useAgentChatStore.setState({ activeRunStatus: 'completed' });
    const deps = makeDeps(
      makeSnapshot({ runId: 'run-new', startedAt: null, status: 'running' }),
    );
    await restoreThreadFromSnapshot('thread-1', deps as never);
    expect(deps.setActiveRun).toHaveBeenCalledWith('run-new', {
      startedAt: null,
      status: 'running',
    });
    expect(deps.markStreamLive).toHaveBeenCalledOnce();
  });
  it.each(['completed', 'failed', 'cancelled'] as const)(
    'does not overwrite a background thread that becomes %s',
    async (terminal) => {
      useAgentChatStore.setState({
        activeThreadId: 'thread-2',
        activeRunId: 'run-2',
      });
      const snapshot = makeSnapshot({
        runId: 'run-1',
        startedAt: null,
        status: 'running',
      });
      const deps = makeDeps(snapshot);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      deps.apiService.getThreadSnapshot.mockImplementation(async () => {
        await gate;
        return snapshot;
      });
      const restore = restoreThreadFromSnapshot('thread-1', deps as never);
      useAgentChatStore.getState().updateThread('thread-1', {
        runStatus: terminal,
        attentionState: 'updated',
      });
      release();
      await restore;
      expect(deps.updateThreadSummary).not.toHaveBeenCalled();
      expect(deps.setMessages).not.toHaveBeenCalled();
      expect(deps.markStreamLive).not.toHaveBeenCalled();
    },
  );

  it('restores an unchanged background summary without replacing the visible run', async () => {
    useAgentChatStore.setState({
      activeThreadId: 'thread-2',
      activeRunId: 'run-2',
    });
    const deps = makeDeps(
      makeSnapshot({ runId: 'run-1', startedAt: null, status: 'running' }),
    );
    await restoreThreadFromSnapshot('thread-1', deps as never);
    expect(deps.updateThreadSummary).toHaveBeenCalledOnce();
    expect(deps.setMessages).not.toHaveBeenCalled();
    expect(deps.setActiveRun).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'does not revive the same run already known as %s when restore begins',
    async (terminal) => {
      useAgentChatStore.setState({ activeRunStatus: terminal });
      const deps = makeDeps(
        makeSnapshot({ runId: 'run-1', startedAt: null, status: 'running' }),
      );
      await restoreThreadFromSnapshot('thread-1', deps as never);
      expect(deps.updateThreadSummary).not.toHaveBeenCalled();
      expect(deps.setActiveRun).not.toHaveBeenCalled();
      expect(deps.markStreamLive).not.toHaveBeenCalled();
    },
  );
  it.each(['new-entry', 'later-event'] as const)(
    'rejects reconnect hydration after %s changes the registry owner',
    async (change) => {
      const entry =
        change === 'later-event'
          ? createAgentStreamEntry('thread-1', 'existing-request')
          : null;
      const deps = makeDeps(
        makeSnapshot({ runId: 'run-1', startedAt: null, status: 'running' }),
      );
      let release: (snapshot: AgentThreadSnapshot) => void = () => {};
      deps.apiService.getThreadSnapshot.mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
      const restoring = restoreThreadFromSnapshot('thread-1', deps as never);
      if (entry) entry.revision += 1;
      else createAgentStreamEntry('thread-1', 'new-request');
      release(
        makeSnapshot({ runId: 'run-1', startedAt: null, status: 'running' }),
      );
      await restoring;
      expect(deps.setMessages).not.toHaveBeenCalled();
      expect(deps.updateThreadSummary).not.toHaveBeenCalled();
    },
  );
});
