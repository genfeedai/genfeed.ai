import type {
  AgentThread,
  AgentUiAction,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { AgentRuntimeState, AgentThreadStatus } from '@genfeedai/contracts';
import type { AgentThreadStatusEvent } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('agent-chat.store finalizeStream', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('persists pending ui actions into the finalized assistant message without duplicates', () => {
    const pendingAction: AgentUiAction = {
      id: 'review-queue-1',
      primaryCta: {
        href: '/publishing/review?batch=000000000000000000000001&filter=ready',
        label: 'Open review queue',
      },
      status: 'completed',
      summaryText: 'Loaded the review queue.',
      title: 'Review queue loaded',
      type: 'completion_summary_card',
    };

    useAgentChatStore.getState().addPendingUiActions([pendingAction]);

    useAgentChatStore.getState().finalizeStream({
      content: '',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'assistant-1',
      metadata: {
        uiActions: [pendingAction],
      },
      role: 'assistant',
      threadId: 'thread-1',
    });

    expect(useAgentChatStore.getState().messages).toHaveLength(1);
    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions,
    ).toEqual([pendingAction]);
    expect(useAgentChatStore.getState().workEvents).toEqual([]);
  });

  it('dedupes analytics snapshot cards by type+title when ids differ', () => {
    useAgentChatStore.getState().addPendingUiActions([
      {
        id: 'analytics-1',
        title: 'Analytics summary (7d)',
        type: 'analytics_snapshot_card',
      },
    ]);

    useAgentChatStore.getState().finalizeStream({
      content: 'Here is your analytics',
      createdAt: '2026-03-26T10:00:00.000Z',
      id: 'assistant-1',
      metadata: {
        uiActions: [
          {
            id: 'analytics-2',
            title: 'Analytics summary (7d)',
            type: 'analytics_snapshot_card',
          },
        ],
      },
      role: 'assistant',
      threadId: 'thread-1',
    });

    expect(
      useAgentChatStore.getState().messages[0]?.metadata?.uiActions,
    ).toHaveLength(1);
  });

  it('merges tool work events by toolCallId across lifecycle updates', () => {
    const store = useAgentChatStore.getState();
    store.addWorkEvent({
      createdAt: '2026-03-26T10:00:00.000Z',
      detail: 'Running get_analytics',
      event: AgentWorkEventType.TOOL_STARTED,
      id: 'call-1',
      label: 'get_analytics',
      status: AgentWorkEventStatus.RUNNING,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'get_analytics',
    });
    store.addWorkEvent({
      createdAt: '2026-03-26T10:00:01.000Z',
      detail: 'get_analytics completed',
      event: AgentWorkEventType.TOOL_COMPLETED,
      id: 'call-1',
      label: 'get_analytics',
      progress: 100,
      status: AgentWorkEventStatus.COMPLETED,
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'get_analytics',
    });

    expect(useAgentChatStore.getState().workEvents).toHaveLength(1);
    expect(useAgentChatStore.getState().workEvents[0]).toMatchObject({
      progress: 100,
      status: AgentWorkEventStatus.COMPLETED,
      toolCallId: 'call-1',
    });
  });
});

describe('agent-chat.store stream item upserts', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('updates duplicate active tool calls instead of appending them', () => {
    const store = useAgentChatStore.getState();

    store.addActiveToolCall({
      arguments: {},
      id: 'call-1',
      name: 'generate',
      status: 'running',
    });
    store.addActiveToolCall({
      arguments: {},
      detail: 'Completed',
      id: 'call-1',
      name: 'generate',
      status: 'completed',
    });

    expect(useAgentChatStore.getState().stream.activeToolCalls).toEqual([
      {
        arguments: {},
        detail: 'Completed',
        id: 'call-1',
        name: 'generate',
        status: 'completed',
      },
    ]);
  });

  it('updates duplicate pending UI actions instead of appending them', () => {
    const store = useAgentChatStore.getState();

    store.addPendingUiActions([
      {
        id: 'action-1',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);
    store.addPendingUiActions([
      {
        id: 'action-1',
        status: 'completed',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);

    expect(useAgentChatStore.getState().stream.pendingUiActions).toEqual([
      {
        id: 'action-1',
        status: 'completed',
        title: 'Generate',
        type: 'generation_action_card',
      },
    ]);
  });
});

describe('agent-chat.store upsertThread', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  function makeThread(id: string) {
    return {
      contextVersion: 1,
      createdAt: '2026-03-26T10:00:00.000Z',
      id,
      status: AgentThreadStatus.ACTIVE,
      title: 'Thread',
      updatedAt: '2026-03-26T10:00:00.000Z',
    };
  }

  it('inserts and updates threads with valid ids', () => {
    useAgentChatStore.getState().upsertThread(makeThread('t-1'));
    useAgentChatStore
      .getState()
      .upsertThread({ ...makeThread('t-1'), title: 'Renamed' });

    expect(useAgentChatStore.getState().threads).toHaveLength(1);
    expect(useAgentChatStore.getState().threads[0]?.title).toBe('Renamed');
  });

  it('ignores threads without a usable id', () => {
    useAgentChatStore
      .getState()
      .upsertThread(makeThread(undefined as unknown as string));
    useAgentChatStore.getState().upsertThread(makeThread('undefined'));
    useAgentChatStore.getState().upsertThread(makeThread(''));

    expect(useAgentChatStore.getState().threads).toHaveLength(0);
  });

  it('re-sorts the list by updatedAt so send and finalize do not wait for a refetch', () => {
    useAgentChatStore.getState().upsertThread({
      ...makeThread('older'),
      title: 'Older',
      updatedAt: '2026-03-26T08:00:00.000Z',
    });
    useAgentChatStore.getState().upsertThread({
      ...makeThread('newer'),
      title: 'Newer',
      updatedAt: '2026-03-26T12:00:00.000Z',
    });

    expect(
      useAgentChatStore.getState().threads.map((thread) => thread.id),
    ).toEqual(['newer', 'older']);

    useAgentChatStore.getState().upsertThread({
      ...makeThread('older'),
      title: 'Bumped after send',
      updatedAt: '2026-03-26T13:00:00.000Z',
    });

    expect(
      useAgentChatStore.getState().threads.map((thread) => thread.id),
    ).toEqual(['older', 'newer']);
    expect(useAgentChatStore.getState().threads[0]?.title).toBe(
      'Bumped after send',
    );
  });
});

describe('agent-chat.store updateThread list order', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  it('promotes a finalized thread from lastActivityAt without a refresh delay', () => {
    useAgentChatStore.getState().setThreads([
      {
        contextVersion: 1,
        createdAt: '2026-03-26T08:00:00.000Z',
        id: 'stale',
        status: AgentThreadStatus.ACTIVE,
        title: 'Stale',
        updatedAt: '2026-03-26T08:00:00.000Z',
      },
      {
        contextVersion: 1,
        createdAt: '2026-03-26T12:00:00.000Z',
        id: 'fresh',
        status: AgentThreadStatus.ACTIVE,
        title: 'Fresh',
        updatedAt: '2026-03-26T12:00:00.000Z',
      },
    ]);

    useAgentChatStore.getState().updateThread('stale', {
      lastActivityAt: '2026-03-26T13:00:00.000Z',
      runStatus: 'completed',
    });

    const threads = useAgentChatStore.getState().threads;
    expect(threads.map((thread) => thread.id)).toEqual(['stale', 'fresh']);
    expect(threads[0]).toMatchObject({
      id: 'stale',
      lastActivityAt: '2026-03-26T13:00:00.000Z',
      runStatus: 'completed',
      updatedAt: '2026-03-26T13:00:00.000Z',
    });
  });
});

describe('request-aware input resolution', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.setState({
      activeThreadId: 'thread-1',
      pendingInputRequest: {
        threadId: 'thread-1',
        inputRequestId: 'new-ask',
        title: 'Choose',
        prompt: 'Current question',
      },
      threads: [
        {
          id: 'thread-1',
          contextVersion: 1,
          status: AgentThreadStatus.ACTIVE,
          createdAt: '2026-09-08T10:00:00Z',
          updatedAt: '2026-09-08T10:00:00Z',
          attentionState: 'needs-input',
          pendingInputCount: 1,
          runStatus: 'waiting_input',
        },
      ],
      runsByThread: {
        'thread-1': {
          isGenerating: false,
          runId: null,
          startedAt: null,
          status: 'awaiting_input',
        },
      },
    });
  });

  it('atomically resumes the matching visible request and summary', () => {
    const listener = vi.fn();
    const unsubscribe = useAgentChatStore.subscribe(listener);
    expect(
      useAgentChatStore
        .getState()
        .resolvePendingInputRequest(
          'thread-1',
          'new-ask',
          '2026-09-08T12:00:00Z',
        ),
    ).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(useAgentChatStore.getState()).toMatchObject({
      pendingInputRequest: null,
      runsByThread: {
        'thread-1': expect.objectContaining({ status: 'running' }),
      },
      threads: [
        expect.objectContaining({
          attentionState: 'running',
          pendingInputCount: 0,
          runStatus: 'running',
          lastActivityAt: '2026-09-08T12:00:00Z',
        }),
      ],
    });
    expect(
      useAgentChatStore
        .getState()
        .resolvePendingInputRequest(
          'thread-1',
          'new-ask',
          '2026-09-08T12:00:01Z',
        ),
    ).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('preserves the newer question and all statuses for stale or unrelated resolutions', () => {
    const before = useAgentChatStore.getState();
    expect(
      before.resolvePendingInputRequest(
        'thread-1',
        'old-ask',
        '2026-09-08T12:00:00Z',
      ),
    ).toBe(false);
    expect(
      before.resolvePendingInputRequest(
        'thread-2',
        'new-ask',
        '2026-09-08T12:00:00Z',
      ),
    ).toBe(false);
    expect(useAgentChatStore.getState()).toBe(before);
  });
});

describe('agent-chat.store thread ui-action states', () => {
  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
  });

  const pendingRun = {
    action: 'confirm_generate_media',
    queuedSequence: 5,
    runId: 'exec-1',
    sourceId: 'proposal-1',
    status: 'pending' as const,
    updatedAt: '2026-09-28T09:00:00.000Z',
  };
  const pendingState = {
    action: 'confirm_generate_media',
    runId: 'exec-1',
    sequence: 5,
    sourceId: 'proposal-1',
    status: 'pending' as const,
    updatedAt: '2026-09-28T09:00:00.000Z',
  };

  it('accepts only events newer than the sequence the thread reflects', () => {
    const store = useAgentChatStore.getState();

    expect(store.acceptThreadEventSequence('thread-1', 4)).toBe(true);
    expect(store.acceptThreadEventSequence('thread-1', 4)).toBe(false);
    expect(store.acceptThreadEventSequence('thread-1', 3)).toBe(false);
    expect(store.acceptThreadEventSequence('thread-1', undefined)).toBe(true);
    expect(store.acceptThreadEventSequence('thread-1', 6)).toBe(true);
    expect(
      useAgentChatStore.getState().threadEventSequenceById['thread-1'],
    ).toBe(6);
  });

  it('adopts a snapshot’s ui-action states and sequence, but never an older snapshot', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-1', status: 'running' },
      lastSequence: 5,
      uiActionRuns: [pendingRun],
    });

    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-1'],
    ).toEqual({ 'confirm_generate_media:proposal-1': pendingState });

    store.applyThreadSnapshotState('thread-1', {
      activeRun: null,
      lastSequence: 4,
      uiActionRuns: [],
    });

    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-1'],
    ).toEqual({ 'confirm_generate_media:proposal-1': pendingState });
    expect(
      useAgentChatStore.getState().threadEventSequenceById['thread-1'],
    ).toBe(5);
  });

  it('keeps a queued run pending while another run owns the thread', () => {
    useAgentChatStore.getState().applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-2', status: 'running' },
      lastSequence: 9,
      uiActionRuns: [pendingRun],
    });

    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-1'],
    ).toEqual({ 'confirm_generate_media:proposal-1': pendingState });
  });

  it('keeps a run acknowledged after the snapshot was read', () => {
    const store = useAgentChatStore.getState();
    store.trackUiActionRun('thread-1', {
      action: 'approve_plan',
      runId: 'exec-3',
      sourceId: 'plan-1',
    });
    store.applyThreadSnapshotState('thread-1', {
      activeRun: null,
      lastSequence: 2,
      uiActionRuns: [],
    });

    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-1']?.[
        'approve_plan:plan-1'
      ]?.status,
    ).toBe('pending');
  });

  it('keeps a run settled by its own event after the snapshot was read', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-0', status: 'running' },
      lastSequence: 4,
      uiActionRuns: [pendingRun],
    });
    // A queued run's result lands while another run is followed.
    store.settleUiActionRun('thread-1', 'exec-1', {
      sequence: 9,
      status: 'completed',
    });
    store.applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-0', status: 'running' },
      lastSequence: 6,
      uiActionRuns: [pendingRun],
    });

    expect(
      useAgentChatStore.getState().uiActionRunsByThread['thread-1']?.['exec-1'],
    ).toMatchObject({ status: 'completed', terminalSequence: 9 });
  });

  it('keeps the projected run when its ack arrives after the snapshot', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadSnapshotState('thread-1', {
      activeRun: null,
      lastSequence: 5,
      uiActionRuns: [pendingRun],
    });
    store.trackUiActionRun('thread-1', {
      action: pendingRun.action,
      runId: pendingRun.runId,
      sourceId: pendingRun.sourceId,
    });

    expect(
      useAgentChatStore.getState().uiActionRunsByThread['thread-1']?.['exec-1'],
    ).toBe(pendingRun);
  });

  it('shows an earlier success over a later duplicate approval failure', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-a', status: 'running' },
      lastSequence: 4,
      uiActionRuns: [
        {
          ...pendingRun,
          action: 'approve_plan',
          queuedSequence: 3,
          runId: 'exec-a',
          sourceId: 'plan-1',
        },
        {
          ...pendingRun,
          action: 'approve_plan',
          queuedSequence: 4,
          runId: 'exec-b',
          sourceId: 'plan-1',
        },
      ],
    });
    store.settleUiActionRun('thread-1', 'exec-a', {
      sequence: 7,
      status: 'completed',
    });
    store.settleUiActionRun('thread-1', 'exec-b', {
      error: 'This plan has already been approved.',
      sequence: 9,
      status: 'failed',
    });

    const state = useAgentChatStore.getState();
    expect(
      state.uiActionStatesByThread['thread-1']?.['approve_plan:plan-1'],
    ).toMatchObject({ runId: 'exec-a', status: 'completed' });
    expect(state.uiActionRunsByThread['thread-1']?.['exec-b']).toMatchObject({
      error: 'This plan has already been approved.',
      status: 'failed',
      terminalSequence: 9,
    });
    // The duplicate failure never takes the source card from the success.
    expect(
      state.isUiActionSourceOwner('thread-1', {
        runId: 'exec-b',
        sequence: 9,
        sourceId: 'plan-1',
      }),
    ).toBe(false);
  });

  it('lets a run update its source only while it owns it at that sequence', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadSnapshotState('thread-1', {
      activeRun: { runId: 'exec-a', status: 'running' },
      lastSequence: 4,
      uiActionRuns: [
        { ...pendingRun, queuedSequence: 3, runId: 'exec-a' },
        { ...pendingRun, queuedSequence: 4, runId: 'exec-b' },
      ],
    });

    // The newer run settles first and takes the source at its sequence.
    store.settleUiActionRun('thread-1', 'exec-b', {
      sequence: 9,
      status: 'completed',
    });
    expect(
      store.isUiActionSourceOwner('thread-1', {
        runId: 'exec-b',
        sequence: 9,
        sourceId: 'proposal-1',
      }),
    ).toBe(true);
    // The older run's late result only records its outcome.
    store.settleUiActionRun('thread-1', 'exec-a', {
      sequence: 7,
      status: 'completed',
    });
    expect(
      store.isUiActionSourceOwner('thread-1', {
        runId: 'exec-a',
        sequence: 7,
        sourceId: 'proposal-1',
      }),
    ).toBe(false);
    // Nor may any result older than the one already applied.
    expect(
      store.isUiActionSourceOwner('thread-1', {
        runId: 'exec-untracked',
        sequence: 8,
        sourceId: 'proposal-1',
      }),
    ).toBe(false);

    const state = useAgentChatStore.getState();
    expect(state.uiActionRunsByThread['thread-1']?.['exec-a']).toMatchObject({
      status: 'completed',
      terminalSequence: 7,
    });
    expect(
      state.uiActionStatesByThread['thread-1']?.[
        'confirm_generate_media:proposal-1'
      ],
    ).toMatchObject({ runId: 'exec-b', sequence: 9 });
  });

  it('settles only the pending state of the named run', () => {
    const store = useAgentChatStore.getState();
    store.trackUiActionRun('thread-1', {
      action: 'approve_plan',
      runId: 'exec-3',
      sourceId: 'plan-1',
    });
    store.settleUiActionRun('thread-1', 'exec-other', { status: 'failed' });
    store.settleUiActionRun('thread-1', 'exec-3', {
      error: 'Plan could not run.',
      sequence: 7,
      status: 'failed',
    });
    store.settleUiActionRun('thread-1', 'exec-3', { status: 'completed' });

    expect(
      useAgentChatStore.getState().uiActionStatesByThread['thread-1']?.[
        'approve_plan:plan-1'
      ],
    ).toMatchObject({
      error: 'Plan could not run.',
      sequence: 7,
      status: 'failed',
    });
  });
});

describe('agent-chat.store applyThreadStatusPush (#5636)', () => {
  const thread = (id: string, overrides: Partial<AgentThread> = {}) =>
    ({
      contextVersion: 1,
      createdAt: '2026-07-28T08:00:00.000Z',
      id,
      status: AgentThreadStatus.ACTIVE,
      title: id,
      updatedAt: '2026-07-28T08:00:00.000Z',
      ...overrides,
    }) as AgentThread;
  const event = (
    overrides: Partial<AgentThreadStatusEvent> = {},
  ): AgentThreadStatusEvent => ({
    organizationId: 'org-1',
    pendingInputCount: 0,
    runStatus: 'running',
    runtimeState: AgentRuntimeState.RUNNING,
    sequence: 5,
    threadId: 'a',
    timestamp: '2026-07-28T08:01:00.000Z',
    userId: 'user-1',
    ...overrides,
  });
  const rowById = (id: string) =>
    useAgentChatStore.getState().threads.find((row) => row.id === id);

  beforeEach(() => {
    useAgentChatStore.setState(useAgentChatStore.getInitialState(), true);
    useAgentChatStore.getState().setThreads([
      thread('a', {
        statusSequence: 2,
        updatedAt: '2026-07-28T08:00:00.000Z',
      }),
      thread('b', { updatedAt: '2026-07-28T07:00:00.000Z' }),
    ]);
  });

  it('moves a thread into Working without touching its position or updatedAt', () => {
    const before = useAgentChatStore.getState().threads.map((row) => row.id);

    expect(useAgentChatStore.getState().applyThreadStatusPush(event())).toBe(
      'applied',
    );

    expect(useAgentChatStore.getState().threads.map((row) => row.id)).toEqual(
      before,
    );
    expect(rowById('a')).toMatchObject({
      attentionState: 'running',
      runStatus: 'running',
      statusSequence: 5,
      updatedAt: '2026-07-28T08:00:00.000Z',
    });
  });

  it('applies a later event and clears Working when the run ends', () => {
    const store = useAgentChatStore.getState();
    store.applyThreadStatusPush(event({ sequence: 5 }));

    expect(
      store.applyThreadStatusPush(
        event({
          runStatus: 'completed',
          runtimeState: AgentRuntimeState.COMPLETED,
          sequence: 8,
        }),
      ),
    ).toBe('applied');

    expect(rowById('a')).toMatchObject({
      attentionState: null,
      runStatus: 'completed',
      statusSequence: 8,
    });
  });

  it.each([
    ['equal to the row', 2],
    ['older than the row', 1],
  ])('ignores an event with a sequence %s', (_label, sequence) => {
    expect(
      useAgentChatStore.getState().applyThreadStatusPush(event({ sequence })),
    ).toBe('stale');
    expect(rowById('a')?.runStatus).toBeUndefined();
  });

  it('ignores an event a live stream this client owns is already at or past', () => {
    const store = useAgentChatStore.getState();

    expect(store.applyThreadStatusPush(event({ sequence: 6 }), 6)).toBe(
      'stale',
    );
    expect(store.applyThreadStatusPush(event({ sequence: 6 }), 9)).toBe(
      'stale',
    );
    expect(rowById('a')?.runStatus).toBeUndefined();
    expect(store.applyThreadStatusPush(event({ sequence: 7 }), 6)).toBe(
      'applied',
    );
  });

  it('reports a thread the list does not hold, without adding a row', () => {
    expect(
      useAgentChatStore
        .getState()
        .applyThreadStatusPush(event({ threadId: 'elsewhere' })),
    ).toBe('unknown-thread');
    expect(useAgentChatStore.getState().threads).toHaveLength(2);
  });

  it('files a thread under Needs you when it waits on the user', () => {
    useAgentChatStore.getState().applyThreadStatusPush(
      event({
        pendingInputCount: 1,
        runStatus: 'waiting_input',
        runtimeState: AgentRuntimeState.AWAITING_INPUT,
      }),
    );

    expect(rowById('a')).toMatchObject({
      attentionState: 'needs-input',
      pendingInputCount: 1,
    });
  });

  it('applies a burst of events across many threads quickly and in order', () => {
    const ids = Array.from({ length: 200 }, (_, index) => `t-${index}`);
    useAgentChatStore.getState().setThreads(ids.map((id) => thread(id)));

    const startedAt = performance.now();
    for (let sequence = 1; sequence <= 10; sequence += 1) {
      for (const id of ids) {
        useAgentChatStore
          .getState()
          .applyThreadStatusPush(event({ sequence, threadId: id }));
      }
    }
    // A replay of the whole burst changes nothing.
    for (const id of ids) {
      expect(
        useAgentChatStore
          .getState()
          .applyThreadStatusPush(event({ sequence: 10, threadId: id })),
      ).toBe('stale');
    }

    expect(performance.now() - startedAt).toBeLessThan(2_000);
    expect(
      useAgentChatStore
        .getState()
        .threads.every((row) => row.statusSequence === 10),
    ).toBe(true);
  });
});
