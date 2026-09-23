import { restoreThreadFromSnapshot } from '@genfeedai/agent/hooks/agent-chat-stream.restore';
import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
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
    useAgentChatStore.setState({ activeThreadId: 'thread-1', threads: [] });
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
});
