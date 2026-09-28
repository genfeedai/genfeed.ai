'use client';

import { MutationApprovalCard } from '@genfeedai/agent/components/MutationApprovalCard';
import { useAgentThreadPrefetch } from '@genfeedai/agent/components/useAgentThreadPrefetch';
import {
  type HandleUiActionDeps,
  handleAgentUiAction,
} from '@genfeedai/agent/hooks/agent-chat-container.ui-actions';
import {
  findAgentStreamEntry,
  resetAgentStreamRuntime,
} from '@genfeedai/agent/hooks/agent-chat-stream.runtime';
import { STREAM_COMPLETION_POLL_INTERVAL_MS } from '@genfeedai/agent/hooks/agent-chat-stream.types';
import { useAgentChatStream } from '@genfeedai/agent/hooks/use-agent-chat-stream';
import type {
  AgentChatMessage,
  AgentProposedPlan,
  AgentThread,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A ui-action's result is an ordinary thread event: the run it starts settles
 * on the turn channel (`agent:done` / `agent:error`) the stream already
 * listens to. These drive the real stream runtime with a socket double.
 */

type SocketHandler = (data: unknown) => void;
const socketHandlers = new Map<string, SocketHandler[]>();

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({
    connectionState: 'connected',
    getSocketManager: () => ({ isConnected: () => true }),
    isReady: true,
    subscribe: (event: string, handler: SocketHandler) => {
      socketHandlers.set(event, [
        ...(socketHandlers.get(event) ?? []),
        handler,
      ]);
      return () => {
        socketHandlers.set(
          event,
          (socketHandlers.get(event) ?? []).filter((item) => item !== handler),
        );
      };
    },
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../utils/apply-dashboard-operation', () => ({
  applyDashboardOperation: vi.fn(),
}));

function emit(event: string, data: Record<string, unknown>): void {
  act(() => {
    for (const handler of socketHandlers.get(event) ?? []) handler(data);
  });
}

function thread(id: string): AgentThread {
  return {
    brandId: 'brand-1',
    contextVersion: 3,
    createdAt: '2026-09-28T09:00:00.000Z',
    id,
    status: AgentThreadStatus.ACTIVE,
    title: id,
    updatedAt: '2026-09-28T09:00:00.000Z',
  } as AgentThread;
}

const approvalCard: AgentUiAction = {
  ctas: [{ action: 'confirm_mutation', label: 'Approve' }],
  data: {
    approvalId: 'approval-1',
    items: [{ label: 'Draft', value: 'Launch post' }],
    sourceActionId: 'mutation-approval:approval-1',
    status: 'pending',
    summary: 'Delete the draft?',
  },
  id: 'mutation-approval:approval-1',
  title: 'Delete the draft',
  type: 'mutation_approval_card',
};
/**
 * What `AgentOrchestratorUiActionMutationService` resolves the card to when
 * the approved action returns `success: false`.
 */
const failedApprovalCard: AgentUiAction = {
  ...approvalCard,
  ctas: [],
  data: {
    ...approvalCard.data,
    error: 'Provider unavailable',
    executionStatus: 'failed',
    status: 'approved',
  },
  requiresConfirmation: false,
};
const approvalPayload = {
  approvalId: 'approval-1',
  sourceActionId: 'mutation-approval:approval-1',
};
const resolvedApprovalCard: AgentUiAction = {
  ...approvalCard,
  ctas: [],
  data: {
    ...approvalCard.data,
    executionStatus: 'completed',
    status: 'approved',
  },
};

function message(
  id: string,
  overrides: Partial<AgentChatMessage> = {},
): AgentChatMessage {
  return {
    content: id,
    createdAt: '2026-09-28T09:00:00.000Z',
    id,
    role: 'assistant',
    threadId: 'thread-a',
    ...overrides,
  };
}

function sourceMessage(): AgentChatMessage {
  return message('proposal', {
    content: 'Approve deleting the draft?',
    metadata: { uiActions: [approvalCard] },
  });
}

function done(overrides: Record<string, unknown> = {}) {
  return {
    creditsRemaining: 90,
    creditsUsed: 0,
    fullContent: 'Approved action completed.',
    metadata: { runId: 'exec-1', uiActions: [resolvedApprovalCard] },
    runId: 'exec-1',
    sequence: 8,
    threadId: 'thread-a',
    toolCalls: [],
    uiAction: {
      action: 'confirm_mutation',
      sourceId: 'mutation-approval:approval-1',
    },
    userId: 'user-1',
    ...overrides,
  };
}

function uiActionState(key = 'confirm_mutation:mutation-approval:approval-1') {
  return useAgentChatStore.getState().uiActionStatesByThread['thread-a']?.[key];
}

function allCards(): AgentUiAction[] {
  return useAgentChatStore
    .getState()
    .messages.flatMap((item) => item.metadata?.uiActions ?? []);
}

function renderStream(apiService: AgentApiService) {
  const view = renderHook(() => useAgentChatStream({ apiService }));
  const deps = (): HandleUiActionDeps => ({
    activeThreadId: useAgentChatStore.getState().activeThreadId,
    activeUiAction: null,
    adoptRun: view.result.current.adoptRun,
    apiService,
    beginRunHandoff: view.result.current.beginRunHandoff,
    cancelRunHandoff: view.result.current.cancelRunHandoff,
    followLatestTurn: vi.fn(),
    isBusy: false,
    isReadOnly: false,
    sendMessage: vi.fn(),
    setActiveUiAction: vi.fn(),
    setError: useAgentChatStore.getState().setError,
    threads: useAgentChatStore.getState().threads,
  });
  return { deps, view };
}

/** No read methods: a ui-action must not poll for its own result. */
function ackingApi(
  respondToUiAction: AgentApiService['respondToUiAction'] = vi
    .fn()
    .mockResolvedValue({
      executionId: 'exec-1',
      status: 'queued',
      threadId: 'thread-a',
    }),
): AgentApiService {
  return { respondToUiAction } as unknown as AgentApiService;
}

describe('ui-action results as thread events', () => {
  beforeEach(() => {
    socketHandlers.clear();
    resetAgentStreamRuntime();
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({
      activeThreadId: 'thread-a',
      messages: [sourceMessage()],
      threads: [thread('thread-a'), thread('thread-b')],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles the card from the run’s agent:done, updating the source card in place', async () => {
    const apiService = ackingApi();
    const { deps } = renderStream(apiService);

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    expect(uiActionState()?.status).toBe('pending');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(true);

    emit('agent:done', done());

    const state = useAgentChatStore.getState();
    expect(state.messages.at(-1)?.content).toBe('Approved action completed.');
    expect(
      allCards().filter((card) => card.type === 'mutation_approval_card'),
    ).toEqual([
      expect.objectContaining({
        ctas: [],
        data: expect.objectContaining({ status: 'approved' }),
        id: 'mutation-approval:approval-1',
        status: 'completed',
      }),
    ]);
    expect(uiActionState()).toMatchObject({
      runId: 'exec-1',
      sequence: 8,
      status: 'completed',
    });
    expect(state.stream.isStreaming).toBe(false);
    expect(state.creditsRemaining).toBe(90);
  });

  it('keeps a result that outruns its ack and applies it once the ack names the run', async () => {
    let resolveAck: (value: unknown) => void = () => {};
    const apiService = ackingApi(
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveAck = resolve;
          }),
      ) as unknown as AgentApiService['respondToUiAction'],
    );
    const { deps } = renderStream(apiService);

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = handleAgentUiAction(
        'confirm_mutation',
        approvalPayload,
        deps(),
      );
    });
    emit('agent:done', done());
    expect(useAgentChatStore.getState().messages).toHaveLength(1);

    await act(async () => {
      resolveAck({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      });
      await outcome;
    });

    expect(useAgentChatStore.getState().messages.at(-1)?.content).toBe(
      'Approved action completed.',
    );
    expect(uiActionState()?.status).toBe('completed');
  });

  it('settles a late ack on its own thread after the user left it and came back (A→B→A)', async () => {
    let resolveAck: (value: unknown) => void = () => {};
    const apiService = ackingApi(
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveAck = resolve;
          }),
      ) as unknown as AgentApiService['respondToUiAction'],
    );
    const { deps } = renderStream(apiService);

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = handleAgentUiAction(
        'confirm_mutation',
        approvalPayload,
        deps(),
      );
    });
    act(() => useAgentChatStore.getState().setActiveThread('thread-b'));
    act(() => useAgentChatStore.getState().setActiveThread('thread-a'));
    await act(async () => {
      resolveAck({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      });
      await outcome;
    });

    expect(uiActionState()?.status).toBe('pending');
    expect(useAgentChatStore.getState().activeRunId).toBe('exec-1');

    emit('agent:done', done());

    expect(useAgentChatStore.getState().messages.at(-1)?.content).toBe(
      'Approved action completed.',
    );
    expect(uiActionState()?.status).toBe('completed');
    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-b'],
    ).toBeUndefined();
  });

  it('updates a source card outside the latest page of messages by id', async () => {
    const history = Array.from({ length: 30 }, (_, index) =>
      message(`history-${index}`, { role: index % 2 ? 'assistant' : 'user' }),
    );
    useAgentChatStore.setState({ messages: [sourceMessage(), ...history] });
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    emit('agent:done', done());

    const { messages } = useAgentChatStore.getState();
    expect(messages[0]?.metadata?.uiActions?.[0]).toMatchObject({
      ctas: [],
      data: { status: 'approved' },
      status: 'completed',
    });
    expect(messages.at(-1)?.metadata?.uiActions ?? []).toEqual([]);
  });

  it('never lets an older run’s result replace a newer plan the thread already reflects', async () => {
    const newerPlan: AgentProposedPlan = {
      awaitingApproval: true,
      content: 'Newer plan',
      createdAt: '2026-09-28T09:10:00.000Z',
      id: 'plan-2',
      status: 'awaiting_approval',
      updatedAt: '2026-09-28T09:10:00.000Z',
    };
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction(
        'revise_plan',
        { planId: 'plan-1', revisionNote: 'Tighten it' },
        deps(),
      );
    });
    // A hydration read the thread after later events: sequence 20, plan-2.
    // Like the thread-switch hydration, it writes the visible conversation
    // and the stream entry that owns the thread.
    act(() => {
      useAgentChatStore.getState().applyThreadSnapshotState('thread-a', {
        activeRun: { runId: 'exec-2', status: 'completed' },
        lastSequence: 20,
        uiActionRuns: [],
      });
      useAgentChatStore.getState().setLatestProposedPlan(newerPlan);
      findAgentStreamEntry('thread-a')?.presentation.setState({
        latestProposedPlan: newerPlan,
      });
    });
    const messagesBefore = useAgentChatStore.getState().messages;

    emit(
      'agent:done',
      done({
        fullContent: 'Revised plan.',
        metadata: {
          proposedPlan: { ...newerPlan, content: 'Older plan', id: 'plan-1' },
          runId: 'exec-1',
        },
        sequence: 12,
        uiAction: { action: 'revise_plan', sourceId: 'plan-1' },
      }),
    );

    const state = useAgentChatStore.getState();
    expect(state.latestProposedPlan).toEqual(newerPlan);
    expect(state.messages).toBe(messagesBefore);
    expect(state.stream.isStreaming).toBe(false);
    expect(uiActionState('revise_plan:plan-1')?.status).toBe('completed');
  });

  it('drops a duplicate or stale delivery by sequence', async () => {
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    emit('agent:done', done());
    emit('agent:done', done());
    emit('agent:error', {
      error: 'late failure',
      runId: 'exec-1',
      sequence: 7,
      threadId: 'thread-a',
      userId: 'user-1',
    });

    const state = useAgentChatStore.getState();
    expect(
      state.messages.filter(
        (item) => item.content === 'Approved action completed.',
      ),
    ).toHaveLength(1);
    expect(state.error).toBeNull();
    expect(uiActionState()?.status).toBe('completed');
    expect(state.threadEventSequenceById['thread-a']).toBe(8);
  });

  it('fails the card with the run’s sanitized error', async () => {
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    emit('agent:error', {
      error: 'This approval expired. Prepare the action again.',
      runId: 'exec-1',
      sequence: 8,
      threadId: 'thread-a',
      uiAction: {
        action: 'confirm_mutation',
        sourceId: 'mutation-approval:approval-1',
      },
      userId: 'user-1',
    });

    const state = useAgentChatStore.getState();
    expect(uiActionState()).toMatchObject({
      error: 'This approval expired. Prepare the action again.',
      status: 'failed',
    });
    expect(state.error).toBe(
      'This approval expired. Prepare the action again.',
    );
    expect(state.stream.isStreaming).toBe(false);
  });

  it('records a cancelled execution as cancelled', async () => {
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    emit('agent:error', {
      error: 'Agent run cancelled',
      runId: 'exec-1',
      threadId: 'thread-a',
      userId: 'user-1',
    });

    expect(uiActionState()?.status).toBe('cancelled');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(false);
  });

  it('settles through the run completion watchdog when the socket event is missed', async () => {
    vi.useFakeTimers();
    const reply = message('server-reply', {
      content: 'Approved action completed.',
      metadata: { runId: 'exec-1' },
    });
    const getMessages = vi.fn().mockResolvedValue([sourceMessage(), reply]);
    const apiService = {
      getMessages,
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      }),
    } as unknown as AgentApiService;
    const { deps } = renderStream(apiService);

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    expect(getMessages).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });

    expect(getMessages).toHaveBeenCalledWith('thread-a', { limit: 100 });
    expect(useAgentChatStore.getState().messages.at(-1)?.id).toBe(
      'server-reply',
    );
    expect(uiActionState()?.status).toBe('completed');
  });

  it('ignores older replies outside the hydrated 50-message window', async () => {
    vi.useFakeTimers();
    const history = Array.from({ length: 100 }, (_, index) =>
      message(`history-${index}`, {
        content: `Historical message ${index}`,
        createdAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
        // Older turns carry their own run ids, or none (pre-stamping rows).
        metadata: index % 4 === 1 ? { runId: `exec-old-${index}` } : {},
        role: index % 2 === 0 ? 'user' : 'assistant',
      }),
    );
    useAgentChatStore.setState({ messages: history.slice(50) });
    let serverMessages = history;
    const getMessages = vi.fn(async () => serverMessages);
    const apiService = {
      getMessages,
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue({ id: 'exec-1', status: 'RUNNING' }),
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      }),
    } as unknown as AgentApiService;
    const { deps } = renderStream(apiService);

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });

    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(uiActionState()?.status).toBe('pending');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(true);

    serverMessages = [
      ...history,
      message('server-reply', {
        content: 'Approved action completed.',
        createdAt: '2026-09-28T09:05:00.000Z',
        metadata: { runId: 'exec-1' },
      }),
    ];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });

    expect(useAgentChatStore.getState().messages.at(-1)?.id).toBe(
      'server-reply',
    );
    expect(uiActionState()?.status).toBe('completed');
  });

  it('recovers the scope a missed brand confirmation moved, so the next action sends it', async () => {
    vi.useFakeTimers();
    const confirmPayload = { label: 'Genfeed', sourceActionId: 'brand-card-1' };
    const reply = message('server-reply', {
      content: 'Brand created and selected for this thread.',
      metadata: {
        agentScope: {
          brandId: 'brand-created-1',
          contextVersion: 4,
          isLegacyFallback: false,
          organizationId: 'org-1',
          source: 'explicit',
          threadId: 'thread-a',
        },
        runId: 'exec-1',
      },
    });
    const respondToUiAction = vi
      .fn()
      .mockResolvedValueOnce({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      })
      .mockResolvedValueOnce({
        executionId: 'exec-2',
        status: 'queued',
        threadId: 'thread-a',
      });
    const apiService = {
      getMessages: vi.fn().mockResolvedValue([sourceMessage(), reply]),
      respondToUiAction,
    } as unknown as AgentApiService;
    const { deps } = renderStream(apiService);

    await act(async () => {
      await handleAgentUiAction('confirm_create_brand', confirmPayload, deps());
    });
    // The socket event is missed; the completion watchdog settles the run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });
    expect(
      useAgentChatStore
        .getState()
        .threads.find((item) => item.id === 'thread-a'),
    ).toMatchObject({ brandId: 'brand-created-1', contextVersion: 4 });

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });

    expect(respondToUiAction).toHaveBeenLastCalledWith(
      'thread-a',
      'confirm_mutation',
      approvalPayload,
      undefined,
      { brandId: 'brand-created-1', expectedContextVersion: 4 },
    );
  });

  it('fails the card of a run that failed without throwing, keeping its reply', async () => {
    const { deps } = renderStream(ackingApi());

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    emit(
      'agent:done',
      done({
        error: 'Provider unavailable',
        fullContent: 'Approved action failed: Provider unavailable',
        metadata: {
          runId: 'exec-1',
          runOutcome: { error: 'Provider unavailable', status: 'failed' },
          uiActions: [failedApprovalCard],
        },
        runStatus: 'failed',
      }),
    );

    const state = useAgentChatStore.getState();
    expect(state.messages.at(-1)?.content).toBe(
      'Approved action failed: Provider unavailable',
    );
    const sourceCard = state.messages[0]?.metadata?.uiActions?.[0];
    expect(sourceCard?.data).toMatchObject({
      executionStatus: 'failed',
      status: 'approved',
    });
    render(<MutationApprovalCard action={sourceCard ?? approvalCard} />);
    expect(screen.getByRole('status')).toHaveTextContent('failed');
    expect(screen.queryByRole('button', { name: 'approve' })).toBeNull();
    expect(uiActionState()).toMatchObject({
      error: 'Provider unavailable',
      status: 'failed',
    });
    expect(state.activeRunStatus).toBe('failed');
    expect(state.error).toBe('Provider unavailable');
  });

  it('does not let a hover prefetch of a thread with a live run swallow that run’s result', async () => {
    vi.useFakeTimers();
    const reply = message('server-reply', {
      content: 'Approved action completed.',
      metadata: { runId: 'exec-1' },
    });
    const apiService = {
      getMessagesPage: vi.fn().mockResolvedValue({
        hasMore: false,
        messages: [sourceMessage(), reply],
        nextCursor: null,
      }),
      // The run's terminal event is persisted before the socket delivers it.
      getThreadSnapshot: vi.fn().mockResolvedValue({
        activeRun: { runId: 'exec-1', status: 'completed' },
        lastAssistantMessage: null,
        lastSequence: 8,
        latestProposedPlan: null,
        latestUiBlocks: null,
        memorySummaryRefs: [],
        pendingApprovals: [],
        pendingInputRequests: [],
        profileSnapshot: null,
        sessionBinding: null,
        source: 'agent',
        threadId: 'thread-a',
        threadStatus: 'active',
        timeline: [],
        title: 'thread-a',
        uiActionRuns: [],
      }),
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      }),
    } as unknown as AgentApiService;
    const { deps } = renderStream(apiService);
    const prefetch = renderHook(() => useAgentThreadPrefetch({ apiService }));

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    // The user moves on and hovers the thread whose run is still live.
    act(() => useAgentChatStore.getState().setActiveThread('thread-b'));
    await act(async () => {
      prefetch.result.current.prefetchThread('thread-a');
      await vi.advanceTimersByTimeAsync(200);
    });

    emit('agent:done', done());

    expect(
      findAgentStreamEntry('thread-a')?.presentation.getState().messages.at(-1)
        ?.content,
    ).toBe('Approved action completed.');
    expect(
      useAgentChatStore.getState().threadEventSequenceById['thread-a'],
    ).toBe(8);
  });

  it('settles every queued card run after a reload, not just the one the thread is running', async () => {
    const secondCard: AgentUiAction = {
      ...approvalCard,
      data: {
        ...approvalCard.data,
        approvalId: 'approval-2',
        sourceActionId: 'mutation-approval:approval-2',
      },
      id: 'mutation-approval:approval-2',
    };
    useAgentChatStore.setState({
      messages: [
        sourceMessage(),
        message('proposal-2', { metadata: { uiActions: [secondCard] } }),
      ],
    });
    const pendingState = (
      runId: string,
      sourceId: string,
      sequence: number,
    ) => ({
      action: 'confirm_mutation',
      queuedSequence: sequence,
      runId,
      sourceId,
      status: 'pending' as const,
      updatedAt: '2026-09-28T09:00:00.000Z',
    });
    renderStream(ackingApi());

    // A reload hydrates both queued approvals; the thread runs the first.
    act(() => {
      const store = useAgentChatStore.getState();
      store.applyThreadSnapshotState('thread-a', {
        activeRun: { runId: 'exec-1', status: 'running' },
        lastSequence: 5,
        uiActionRuns: [
          pendingState('exec-1', 'mutation-approval:approval-1', 4),
          pendingState('exec-2', 'mutation-approval:approval-2', 5),
        ],
      });
      store.setActiveRun('exec-1', { startedAt: null, status: 'running' });
      store.markStreamLive();
    });
    expect(findAgentStreamEntry('thread-a')).toBeDefined();

    emit('agent:done', done());
    emit(
      'agent:done',
      done({
        fullContent: 'Second approval completed.',
        metadata: {
          runId: 'exec-2',
          uiActions: [
            {
              ...secondCard,
              ctas: [],
              data: { ...secondCard.data, status: 'approved' },
            },
          ],
        },
        runId: 'exec-2',
        sequence: 9,
        uiAction: {
          action: 'confirm_mutation',
          sourceId: 'mutation-approval:approval-2',
        },
      }),
    );

    expect(uiActionState()?.status).toBe('completed');
    expect(
      uiActionState('confirm_mutation:mutation-approval:approval-2')?.status,
    ).toBe('completed');
    expect(useAgentChatStore.getState().messages.at(-1)?.content).toBe(
      'Second approval completed.',
    );
  });

  it('settles a queued card run whose result lands while another run is followed', async () => {
    renderStream(ackingApi());
    act(() => {
      const store = useAgentChatStore.getState();
      store.applyThreadSnapshotState('thread-a', {
        activeRun: { runId: 'exec-1', status: 'running' },
        lastSequence: 5,
        uiActionRuns: [
          {
            action: 'confirm_mutation',
            queuedSequence: 5,
            runId: 'exec-2',
            sourceId: 'mutation-approval:approval-2',
            status: 'pending',
            updatedAt: '2026-09-28T09:00:00.000Z',
          },
        ],
      });
      store.setActiveRun('exec-1', { startedAt: null, status: 'running' });
      store.markStreamLive();
    });

    emit('agent:error', {
      error: 'This approval expired. Prepare the action again.',
      runId: 'exec-2',
      sequence: 7,
      threadId: 'thread-a',
      uiAction: {
        action: 'confirm_mutation',
        sourceId: 'mutation-approval:approval-2',
      },
      userId: 'user-1',
    });

    expect(
      uiActionState('confirm_mutation:mutation-approval:approval-2'),
    ).toMatchObject({
      error: 'This approval expired. Prepare the action again.',
      status: 'failed',
    });
    // The followed run is untouched.
    expect(useAgentChatStore.getState().activeRunId).toBe('exec-1');
    expect(useAgentChatStore.getState().stream.isStreaming).toBe(true);
  });

  it('follows the next queued card run through the watchdog when its event is missed', async () => {
    vi.useFakeTimers();
    const getMessages = vi.fn().mockResolvedValue([
      sourceMessage(),
      message('reply-2', {
        content: 'Second approval completed.',
        metadata: { runId: 'exec-2' },
      }),
    ]);
    renderStream({ getMessages } as unknown as AgentApiService);
    act(() => {
      const store = useAgentChatStore.getState();
      store.applyThreadSnapshotState('thread-a', {
        activeRun: { runId: 'exec-1', status: 'running' },
        lastSequence: 5,
        uiActionRuns: [
          {
            action: 'confirm_mutation',
            queuedSequence: 5,
            runId: 'exec-2',
            sourceId: 'mutation-approval:approval-2',
            status: 'pending',
            updatedAt: '2026-09-28T09:00:00.000Z',
          },
        ],
      });
      store.setActiveRun('exec-1', { startedAt: null, status: 'running' });
      store.markStreamLive();
    });

    emit('agent:done', done());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });

    expect(
      uiActionState('confirm_mutation:mutation-approval:approval-2')?.status,
    ).toBe('completed');
    expect(useAgentChatStore.getState().messages.at(-1)?.id).toBe('reply-2');
  });

  it('recovers a structured failure from the reply when its event is missed', async () => {
    vi.useFakeTimers();
    const apiService = {
      getMessages: vi.fn().mockResolvedValue([
        sourceMessage(),
        message('server-reply', {
          content: 'Approved action failed: Provider unavailable',
          metadata: {
            runId: 'exec-1',
            runOutcome: { error: 'Provider unavailable', status: 'failed' },
            uiActions: [failedApprovalCard],
          },
        }),
      ]),
      respondToUiAction: vi.fn().mockResolvedValue({
        executionId: 'exec-1',
        status: 'queued',
        threadId: 'thread-a',
      }),
    } as unknown as AgentApiService;
    const { deps } = renderStream(apiService);

    await act(async () => {
      await handleAgentUiAction('confirm_mutation', approvalPayload, deps());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
    });

    const state = useAgentChatStore.getState();
    expect(uiActionState()).toMatchObject({
      error: 'Provider unavailable',
      status: 'failed',
    });
    expect(state.activeRunStatus).toBe('failed');
    expect(state.error).toBe('Provider unavailable');
  });

  describe('two queued card runs after a reload', () => {
    const secondCard: AgentUiAction = {
      ...approvalCard,
      data: {
        ...approvalCard.data,
        approvalId: 'approval-2',
        sourceActionId: 'mutation-approval:approval-2',
      },
      id: 'mutation-approval:approval-2',
    };
    const failedSecondCard: AgentUiAction = {
      ...failedApprovalCard,
      data: {
        ...failedApprovalCard.data,
        approvalId: 'approval-2',
        sourceActionId: 'mutation-approval:approval-2',
      },
      id: 'mutation-approval:approval-2',
    };
    const secondKey = 'confirm_mutation:mutation-approval:approval-2';
    const pendingState = (
      runId: string,
      sourceId: string,
      sequence: number,
    ) => ({
      action: 'confirm_mutation',
      queuedSequence: sequence,
      runId,
      sourceId,
      status: 'pending' as const,
      updatedAt: '2026-09-28T09:00:00.000Z',
    });

    function hydrateTwoQueuedRuns(): void {
      useAgentChatStore.setState({
        messages: [
          sourceMessage(),
          message('proposal-2', { metadata: { uiActions: [secondCard] } }),
        ],
      });
      act(() => {
        const store = useAgentChatStore.getState();
        store.applyThreadSnapshotState('thread-a', {
          activeRun: { runId: 'exec-1', status: 'running' },
          lastSequence: 5,
          uiActionRuns: [
            pendingState('exec-1', 'mutation-approval:approval-1', 4),
            pendingState('exec-2', 'mutation-approval:approval-2', 5),
          ],
        });
        store.setActiveRun('exec-1', { startedAt: null, status: 'running' });
        store.markStreamLive();
      });
    }

    it('settles the next run from its own reply when one fetch loaded both', async () => {
      vi.useFakeTimers();
      const replies = [
        message('reply-1', {
          content: 'Approved action completed.',
          metadata: { runId: 'exec-1' },
        }),
        message('reply-2', {
          content: 'Approved action failed: Provider unavailable',
          metadata: {
            runId: 'exec-2',
            runOutcome: { error: 'Provider unavailable', status: 'failed' },
          },
        }),
      ];
      renderStream({
        getMessages: vi
          .fn()
          .mockResolvedValue([
            sourceMessage(),
            message('proposal-2', { metadata: { uiActions: [secondCard] } }),
            ...replies,
          ]),
        getWorkflowExecution: vi
          .fn()
          .mockResolvedValue({ id: 'exec-2', status: 'COMPLETED' }),
      } as unknown as AgentApiService);
      hydrateTwoQueuedRuns();

      // Both sockets events are missed; one watchdog fetch loads both replies.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
      });
      expect(uiActionState()?.status).toBe('completed');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(STREAM_COMPLETION_POLL_INTERVAL_MS);
      });

      expect(uiActionState(secondKey)).toMatchObject({
        error: 'Provider unavailable',
        status: 'failed',
      });
      expect(useAgentChatStore.getState().activeRunStatus).toBe('failed');
    });

    it('shows the failed card of a queued run whose result lands while another is followed', async () => {
      renderStream(ackingApi());
      hydrateTwoQueuedRuns();

      emit(
        'agent:done',
        done({
          error: 'Provider unavailable',
          fullContent: 'Approved action failed: Provider unavailable',
          metadata: {
            runId: 'exec-2',
            runOutcome: { error: 'Provider unavailable', status: 'failed' },
            uiActions: [failedSecondCard],
          },
          runId: 'exec-2',
          runStatus: 'failed',
          sequence: 7,
          uiAction: {
            action: 'confirm_mutation',
            sourceId: 'mutation-approval:approval-2',
          },
        }),
      );

      expect(uiActionState(secondKey)?.status).toBe('failed');
      expect(useAgentChatStore.getState().activeRunId).toBe('exec-1');
      const card = useAgentChatStore
        .getState()
        .messages.find((item) => item.id === 'proposal-2')?.metadata
        ?.uiActions?.[0];
      expect(card?.data).toMatchObject({
        executionStatus: 'failed',
        status: 'approved',
      });
      render(<MutationApprovalCard action={card ?? secondCard} />);
      expect(screen.getByRole('status')).toHaveTextContent('failed');
      expect(screen.queryByRole('button', { name: 'approve' })).toBeNull();
    });
  });

  it('completes a ui-action run restored after reload that finished without a reply of its own', async () => {
    vi.useFakeTimers();
    renderStream({
      getMessages: vi.fn().mockResolvedValue([sourceMessage()]),
      getWorkflowExecution: vi
        .fn()
        .mockResolvedValue({ id: 'exec-1', status: 'COMPLETED' }),
    } as unknown as AgentApiService);
    act(() => {
      const store = useAgentChatStore.getState();
      store.applyThreadSnapshotState('thread-a', {
        activeRun: { runId: 'exec-1', status: 'running' },
        lastSequence: 4,
        uiActionRuns: [
          {
            action: 'confirm_mutation',
            queuedSequence: 4,
            runId: 'exec-1',
            sourceId: 'mutation-approval:approval-1',
            status: 'pending',
            updatedAt: '2026-09-28T09:00:00.000Z',
          },
        ],
      });
      store.setActiveRun('exec-1', { startedAt: null, status: 'running' });
      store.markStreamLive();
    });

    // An idempotent replay completes the execution without a new reply.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100_000);
    });

    const state = useAgentChatStore.getState();
    expect(uiActionState()?.status).toBe('completed');
    expect(state.activeRunStatus).toBe('completed');
    expect(state.error).toBeNull();
  });

  describe('runs on the same source', () => {
    const planKey = 'approve_plan:plan-1';
    const cardSource = 'mutation-approval:approval-1';
    const cardWith = (title: string): AgentUiAction => ({
      ...resolvedApprovalCard,
      title,
    });
    const sourceCard = () =>
      useAgentChatStore
        .getState()
        .messages.find((item) => item.id === 'proposal')?.metadata
        ?.uiActions?.[0];

    function followWithQueued(
      followedRunId: string,
      queued: Array<{ action: string; runId: string; sourceId: string }>,
    ): void {
      act(() => {
        const store = useAgentChatStore.getState();
        for (const run of queued) store.trackUiActionRun('thread-a', run);
        store.setActiveRun(followedRunId, {
          startedAt: null,
          status: 'running',
        });
        store.markStreamLive();
      });
    }

    it('keeps the running run and its queued successor through a reconnect snapshot', () => {
      renderStream(ackingApi());
      act(() => {
        const store = useAgentChatStore.getState();
        store.applyThreadSnapshotState('thread-a', {
          activeRun: { runId: 'exec-a', status: 'running' },
          lastSequence: 4,
          uiActionRuns: [
            {
              action: 'approve_plan',
              queuedSequence: 3,
              runId: 'exec-a',
              sourceId: 'plan-1',
              status: 'pending',
              updatedAt: '2026-09-28T09:00:00.000Z',
            },
            {
              action: 'approve_plan',
              queuedSequence: 4,
              runId: 'exec-b',
              sourceId: 'plan-1',
              status: 'pending',
              updatedAt: '2026-09-28T09:00:00.000Z',
            },
          ],
        });
        store.setActiveRun('exec-a', { startedAt: null, status: 'running' });
        store.markStreamLive();
      });

      emit(
        'agent:done',
        done({
          fullContent: 'Plan approved.',
          metadata: { runId: 'exec-a' },
          runId: 'exec-a',
          sequence: 7,
          uiAction: { action: 'approve_plan', sourceId: 'plan-1' },
        }),
      );

      // The card stays in flight on the queued approval, which the stream
      // follows next.
      expect(uiActionState(planKey)).toMatchObject({
        runId: 'exec-b',
        status: 'pending',
      });
      expect(
        useAgentChatStore.getState().uiActionRunsByThread['thread-a']?.[
          'exec-a'
        ],
      ).toMatchObject({ status: 'completed', terminalSequence: 7 });
      expect(useAgentChatStore.getState().activeRunId).toBe('exec-b');
    });

    it('shows the plan approved when a second queued approval fails as a duplicate', () => {
      renderStream(ackingApi());
      followWithQueued('exec-a', [
        { action: 'approve_plan', runId: 'exec-a', sourceId: 'plan-1' },
        { action: 'approve_plan', runId: 'exec-b', sourceId: 'plan-1' },
      ]);

      emit(
        'agent:done',
        done({
          fullContent: 'Plan approved.',
          metadata: { runId: 'exec-a' },
          runId: 'exec-a',
          sequence: 7,
          uiAction: { action: 'approve_plan', sourceId: 'plan-1' },
        }),
      );
      emit('agent:error', {
        error: 'This plan has already been approved.',
        runId: 'exec-b',
        sequence: 9,
        threadId: 'thread-a',
        uiAction: { action: 'approve_plan', sourceId: 'plan-1' },
        userId: 'user-1',
      });

      expect(uiActionState(planKey)).toMatchObject({
        runId: 'exec-a',
        status: 'completed',
      });
      expect(
        useAgentChatStore.getState().uiActionRunsByThread['thread-a']?.[
          'exec-b'
        ],
      ).toMatchObject({
        error: 'This plan has already been approved.',
        status: 'failed',
      });
    });

    it('never lets an older run’s late result overwrite the card a newer run resolved', () => {
      renderStream(ackingApi());
      followWithQueued('exec-a', [
        { action: 'confirm_mutation', runId: 'exec-a', sourceId: cardSource },
        { action: 'confirm_mutation', runId: 'exec-b', sourceId: cardSource },
      ]);

      // The newer run's result is delivered first, while exec-a is followed.
      emit(
        'agent:done',
        done({
          fullContent: 'Second result.',
          metadata: { runId: 'exec-b', uiActions: [cardWith('Result B')] },
          runId: 'exec-b',
          sequence: 9,
        }),
      );
      expect(sourceCard()?.title).toBe('Result B');

      // The older run's result arrives late on the followed stream.
      emit(
        'agent:done',
        done({
          fullContent: 'First result.',
          metadata: { runId: 'exec-a', uiActions: [cardWith('Result A')] },
          runId: 'exec-a',
          sequence: 7,
        }),
      );

      const state = useAgentChatStore.getState();
      expect(sourceCard()?.title).toBe('Result B');
      expect(state.messages.at(-1)?.content).toBe('First result.');
      expect(state.messages.at(-1)?.metadata?.uiActions ?? []).toEqual([]);
      expect(state.uiActionRunsByThread['thread-a']?.['exec-a']).toMatchObject({
        status: 'completed',
        terminalSequence: 7,
      });
      expect(uiActionState(`confirm_mutation:${cardSource}`)).toMatchObject({
        runId: 'exec-b',
        status: 'completed',
      });
    });

    it('never lets an older detached result overwrite a newer detached one', () => {
      renderStream(ackingApi());
      followWithQueued('exec-main', [
        { action: 'confirm_mutation', runId: 'exec-a', sourceId: cardSource },
        { action: 'confirm_mutation', runId: 'exec-b', sourceId: cardSource },
      ]);

      emit(
        'agent:done',
        done({
          metadata: { runId: 'exec-b', uiActions: [cardWith('Result B')] },
          runId: 'exec-b',
          sequence: 9,
        }),
      );
      emit(
        'agent:done',
        done({
          metadata: { runId: 'exec-a', uiActions: [cardWith('Result A')] },
          runId: 'exec-a',
          sequence: 7,
        }),
      );

      expect(sourceCard()?.title).toBe('Result B');
      expect(uiActionState(`confirm_mutation:${cardSource}`)).toMatchObject({
        runId: 'exec-b',
        status: 'completed',
      });
      expect(useAgentChatStore.getState().activeRunId).toBe('exec-main');
    });

    it('restores an earlier success over a duplicate failure whose result arrived first', () => {
      renderStream(ackingApi());
      followWithQueued('exec-a', [
        { action: 'confirm_mutation', runId: 'exec-a', sourceId: cardSource },
        { action: 'confirm_mutation', runId: 'exec-b', sourceId: cardSource },
      ]);

      // The duplicate approval's failure is published before the first
      // approval's result.
      emit(
        'agent:done',
        done({
          error: 'This action was already approved.',
          fullContent: 'Already approved.',
          metadata: { runId: 'exec-b', uiActions: [failedApprovalCard] },
          runId: 'exec-b',
          runStatus: 'failed',
          sequence: 9,
        }),
      );
      emit(
        'agent:done',
        done({
          metadata: { runId: 'exec-a', uiActions: [resolvedApprovalCard] },
          runId: 'exec-a',
          sequence: 7,
        }),
      );

      expect(sourceCard()?.data).toMatchObject({
        executionStatus: 'completed',
        status: 'approved',
      });
      expect(uiActionState(`confirm_mutation:${cardSource}`)).toMatchObject({
        runId: 'exec-a',
        status: 'completed',
      });
      expect(
        useAgentChatStore.getState().uiActionRunsByThread['thread-a']?.[
          'exec-b'
        ],
      ).toMatchObject({ status: 'failed', terminalSequence: 9 });
    });
  });
});
