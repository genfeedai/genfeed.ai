import { AgentThreadProjectorService } from '@api/services/agent-threading/services/agent-thread-projector.service';
import {
  type AgentThreadUiActionRun,
  deriveAgentUiActionStates,
} from '@genfeedai/contracts/interfaces';

describe('AgentThreadProjectorService', () => {
  let service: AgentThreadProjectorService;

  beforeEach(() => {
    service = new AgentThreadProjectorService();
  });

  it('tracks pending input requests and removes them when resolved', () => {
    const threadId = 'test-object-id';

    const afterInputRequested = service.applyEvent(null, {
      commandId: 'cmd-1',
      eventId: 'event-1',
      occurredAt: '2026-03-09T10:00:00.000Z',
      payload: {
        allowFreeText: true,
        options: [{ id: 'approve', label: 'Approve' }],
        prompt: 'Approve this draft?',
        requestId: 'input-1',
        title: 'Approval required',
      },
      runId: 'run-1',
      sequence: 1,
      threadId,
      type: 'input.requested',
    } as never);

    expect(afterInputRequested.pendingInputRequests).toEqual([
      {
        allowFreeText: true,
        createdAt: '2026-03-09T10:00:00.000Z',
        options: [{ id: 'approve', label: 'Approve' }],
        prompt: 'Approve this draft?',
        recommendedOptionId: undefined,
        requestId: 'input-1',
        title: 'Approval required',
      },
    ]);

    const afterInputResolved = service.applyEvent(
      afterInputRequested as never,
      {
        commandId: 'cmd-2',
        eventId: 'event-2',
        occurredAt: '2026-03-09T10:01:00.000Z',
        payload: {
          answer: 'approve',
          requestId: 'input-1',
        },
        runId: 'run-1',
        sequence: 2,
        threadId,
        type: 'input.resolved',
      } as never,
    );

    expect(afterInputResolved.pendingInputRequests).toEqual([]);
  });

  it('preserves independent pending requests until each is resolved', () => {
    const first = { requestId: 'input-1', options: [], title: 'First' };
    const snapshot = { pendingInputRequests: [first] };
    const requested = service.applyEvent(
      snapshot as never,
      {
        threadId: 'thread-1',
        sequence: 1,
        type: 'input.requested',
        payload: { requestId: 'input-2', title: 'Second', options: [] },
      } as never,
    );
    expect(requested.pendingInputRequests).toEqual([
      first,
      expect.objectContaining({ requestId: 'input-2' }),
    ]);
    const resolved = service.applyEvent(
      requested as never,
      {
        threadId: 'thread-1',
        sequence: 2,
        type: 'input.resolved',
        payload: { requestId: 'input-2' },
      } as never,
    );
    expect(resolved.pendingInputRequests).toEqual([first]);
  });

  it('stores the final assistant message and run completion state', () => {
    const threadId = 'test-object-id';

    const afterRunStarted = service.applyEvent(null, {
      commandId: 'cmd-run',
      eventId: 'event-run',
      occurredAt: '2026-03-09T11:00:00.000Z',
      payload: {
        model: 'openai/gpt-4.1',
        startedAt: '2026-03-09T11:00:00.000Z',
      },
      runId: 'run-2',
      sequence: 1,
      threadId,
      type: 'thread.turn_started',
    } as never);

    const afterAssistantFinalized = service.applyEvent(
      afterRunStarted as never,
      {
        commandId: 'cmd-final',
        eventId: 'event-final',
        occurredAt: '2026-03-09T11:02:00.000Z',
        payload: {
          content: 'Final assistant response',
          messageId: 'message-1',
          metadata: { model: 'openai/gpt-4.1' },
        },
        runId: 'run-2',
        sequence: 2,
        threadId,
        type: 'assistant.finalized',
      } as never,
    );

    const afterRunCompleted = service.applyEvent(
      afterAssistantFinalized as never,
      {
        commandId: 'cmd-complete',
        eventId: 'event-complete',
        occurredAt: '2026-03-09T11:02:10.000Z',
        payload: {
          detail: 'Run completed successfully',
          label: 'Run completed',
          status: 'completed',
        },
        runId: 'run-2',
        sequence: 3,
        threadId,
        type: 'run.completed',
      } as never,
    );

    expect(afterRunCompleted.lastAssistantMessage).toEqual({
      content: 'Final assistant response',
      createdAt: '2026-03-09T11:02:00.000Z',
      messageId: 'message-1',
      metadata: { model: 'openai/gpt-4.1' },
    });
    expect(afterRunCompleted.activeRun).toEqual({
      completedAt: '2026-03-09T11:02:10.000Z',
      model: 'openai/gpt-4.1',
      runId: 'run-2',
      startedAt: '2026-03-09T11:00:00.000Z',
      status: 'completed',
    });
    expect(afterRunCompleted.timeline).toHaveLength(3);
  });

  it('derives synthesized ids from the scalar thread id', () => {
    const projected = service.applyEvent(null, {
      commandId: 'cmd-scalar',
      occurredAt: '2026-03-11T09:00:00.000Z',
      payload: { content: 'Streamed answer' },
      runId: 'run-scalar',
      sequence: 4,
      threadId: 'thread-scalar-id',
      type: 'assistant.finalized',
    } as never);

    expect(projected.lastAssistantMessage).toEqual({
      content: 'Streamed answer',
      createdAt: '2026-03-11T09:00:00.000Z',
      messageId: 'thread-scalar-id:4',
      metadata: undefined,
    });
    expect(projected.timeline).toEqual([
      expect.objectContaining({ id: 'thread-scalar-id:4' }),
    ]);
  });

  it('keeps the previous meaningful assistant preview after an empty finalization', () => {
    const projected = service.applyEvent(
      {
        lastAssistantMessage: {
          content: 'Your publish-ready draft is complete.',
          createdAt: '2026-03-11T08:55:00.000Z',
          messageId: 'message-previous',
        },
        threadId: 'thread-empty-final',
      } as never,
      {
        commandId: 'cmd-empty-final',
        eventId: 'event-empty-final',
        occurredAt: '2026-03-11T09:00:00.000Z',
        payload: { content: '   ' },
        runId: 'run-empty-final',
        sequence: 6,
        threadId: 'thread-empty-final',
        type: 'assistant.finalized',
      } as never,
    );

    expect(projected.lastAssistantMessage).toEqual({
      content: 'Your publish-ready draft is complete.',
      createdAt: '2026-03-11T08:55:00.000Z',
      messageId: 'message-previous',
    });
  });

  it('does not manufacture a thread relation alias in snapshot data', () => {
    const projected = service.applyEvent(
      { threadId: 'thread-scalar-id' } as never,
      {
        commandId: 'cmd-mirror',
        eventId: 'event-mirror',
        occurredAt: '2026-03-11T09:05:00.000Z',
        payload: { content: 'Another answer' },
        runId: 'run-mirror',
        sequence: 5,
        threadId: 'thread-scalar-id',
        type: 'assistant.finalized',
      } as never,
    );

    expect(projected).not.toHaveProperty('thread');
  });

  it('stores proposed plan review metadata from plan events', () => {
    const threadId = 'test-object-id';

    const afterPlanUpserted = service.applyEvent(null, {
      commandId: 'cmd-plan',
      eventId: 'event-plan',
      occurredAt: '2026-03-10T09:00:00.000Z',
      payload: {
        awaitingApproval: true,
        content:
          '1. Add the toggle\n2. Persist the flag\n3. Pause for approval',
        explanation: 'Plan mode should stop before execution.',
        id: 'plan-1',
        lastReviewAction: 'request_changes',
        revisionNote: 'Put the toggle in the prompt bar.',
        status: 'awaiting_approval',
        steps: [{ status: 'pending', step: 'Add thread-level plan mode' }],
      },
      runId: 'run-plan',
      sequence: 1,
      threadId,
      type: 'plan.upserted',
    } as never);

    expect(afterPlanUpserted.latestProposedPlan).toEqual({
      awaitingApproval: true,
      content: '1. Add the toggle\n2. Persist the flag\n3. Pause for approval',
      createdAt: '2026-03-10T09:00:00.000Z',
      explanation: 'Plan mode should stop before execution.',
      id: 'plan-1',
      lastReviewAction: 'request_changes',
      revisionNote: 'Put the toggle in the prompt bar.',
      status: 'awaiting_approval',
      steps: [{ status: 'pending', step: 'Add thread-level plan mode' }],
      updatedAt: '2026-03-10T09:00:00.000Z',
    });
  });
});

describe('AgentThreadProjectorService terminal races', () => {
  const service = new AgentThreadProjectorService();
  const event = (type: string, runId = 'run-current', payload = {}) => ({
    commandId: 'command',
    eventId: type,
    occurredAt: '2026-09-08T12:00:00.000Z',
    payload,
    runId,
    sequence: 9,
    threadId: 'thread',
    type,
  });

  it.each([
    'tool.started',
    'tool.progress',
    'tool.completed',
    'work.started',
    'work.completed',
    'run.completed',
    'run.failed',
    'input.requested',
  ])(
    'retains a stopped run after late %s while retaining event history',
    (type) => {
      const projected = service.applyEvent(
        {
          activeRun: { runId: 'run-current', status: 'interrupted' },
          timeline: [],
        } as never,
        event(type) as never,
      );
      expect(projected.activeRun).toEqual({
        runId: 'run-current',
        status: 'interrupted',
      });
      expect(projected.lastSequence).toBe(9);
      expect(projected.timeline).toHaveLength(1);
      expect(projected.pendingInputRequests).toEqual([]);
    },
  );

  it.each([
    'run.completed',
    'run.failed',
    'tool.started',
    'assistant.finalized',
    'input.requested',
  ])('does not replace the current run with an older run %s', (type) => {
    const projected = service.applyEvent(
      {
        activeRun: { runId: 'run-current', status: 'running' },
      } as never,
      event(type, 'run-older', {
        content: 'obsolete',
        requestId: 'obsolete',
      }) as never,
    );
    expect(projected.activeRun).toEqual({
      runId: 'run-current',
      status: 'running',
    });
    expect(projected.lastAssistantMessage).toBeUndefined();
    expect(projected.pendingInputRequests).toEqual([]);
  });

  it('resets terminal metadata when a new turn is accepted', () => {
    const projected = service.applyEvent(
      {
        activeRun: {
          runId: 'run-older',
          status: 'failed',
          completedAt: 'old',
          model: 'old',
        },
      } as never,
      event('thread.turn_requested') as never,
    );
    expect(projected.activeRun).toEqual({
      runId: 'run-current',
      startedAt: '2026-09-08T12:00:00.000Z',
      status: 'queued',
    });
  });

  it('clears pending decisions on stop and permits an interruption refinement', () => {
    const cancelled = service.applyEvent(
      {
        activeRun: { runId: 'run-current', status: 'running' },
        pendingInputRequests: [{ requestId: 'request' }],
        pendingApprovals: [{ id: 'approval' }],
        latestProposedPlan: { awaitingApproval: true },
      } as never,
      event('run.cancelled') as never,
    );
    expect(cancelled.pendingInputRequests).toEqual([]);
    expect(cancelled.pendingApprovals).toEqual([]);
    expect(cancelled.latestProposedPlan).toBeUndefined();
    const interrupted = service.applyEvent(
      cancelled as never,
      event('run.interrupted') as never,
    );
    expect(interrupted.activeRun).toMatchObject({ status: 'interrupted' });
  });
});

it('keeps a retry question after a recoverable tool error until the run settles', () => {
  const service = new AgentThreadProjectorService();
  const projected = service.applyEvent(
    {
      activeRun: { runId: 'run', status: 'running' },
      pendingInputRequests: [
        { requestId: 'retry', title: 'Source needs attention' },
      ],
    } as never,
    {
      type: 'tool.completed',
      runId: 'run',
      sequence: 2,
      threadId: 'thread',
      occurredAt: '2026-09-08T12:00:00.000Z',
      payload: { status: 'failed', error: 'Import unavailable' },
    } as never,
  );
  expect(projected.activeRun).toMatchObject({ status: 'running' });
  expect(projected.pendingInputRequests).toHaveLength(1);
});

describe('AgentThreadProjectorService ui-action run states', () => {
  let service: AgentThreadProjectorService;

  beforeEach(() => {
    service = new AgentThreadProjectorService();
  });

  const requested = (runId: string, sequence: number, sourceId = 'card-1') =>
    ({
      commandId: `turn-requested:thread-1:${runId}`,
      occurredAt: '2026-09-28T09:00:00.000Z',
      payload: {
        content: 'Confirmed image generation.',
        uiAction: { action: 'confirm_generate_media', sourceId },
      },
      runId,
      sequence,
      threadId: 'thread-1',
      type: 'thread.turn_requested',
    }) as never;
  const terminal = (
    type: string,
    runId: string,
    sequence: number,
    payload: Record<string, unknown> = {},
  ) =>
    ({
      commandId: `${type}:${runId}`,
      occurredAt: '2026-09-28T09:01:00.000Z',
      payload,
      runId,
      sequence,
      threadId: 'thread-1',
      type,
    }) as never;

  it('records a pending run for the ui-action a run executes', () => {
    const snapshot = service.applyEvent(null, requested('exec-1', 3));

    expect(snapshot.uiActionRuns).toEqual([
      {
        action: 'confirm_generate_media',
        queuedSequence: 3,
        runId: 'exec-1',
        sourceId: 'card-1',
        status: 'pending',
        updatedAt: '2026-09-28T09:00:00.000Z',
      },
    ]);
  });

  it.each([
    ['run.completed', 'completed', undefined],
    ['run.failed', 'failed', 'Provider unavailable.'],
    ['run.cancelled', 'cancelled', undefined],
  ])('settles it on %s', (type, status, error) => {
    const pending = service.applyEvent(null, requested('exec-1', 3));
    const settled = service.applyEvent(
      pending as never,
      terminal(type, 'exec-1', 5, error ? { error } : {}),
    );

    expect(settled.uiActionRuns).toEqual([
      expect.objectContaining({
        queuedSequence: 3,
        runId: 'exec-1',
        status,
        terminalSequence: 5,
        ...(error ? { error } : {}),
      }),
    ]);
  });

  it('keeps the first terminal outcome of a run', () => {
    const pending = service.applyEvent(null, requested('exec-1', 3));
    const failed = service.applyEvent(
      pending as never,
      terminal('run.failed', 'exec-1', 4, { error: 'Nope.' }),
    );
    const later = service.applyEvent(
      failed as never,
      terminal('run.completed', 'exec-1', 5),
    );

    expect(later.uiActionRuns).toEqual([
      expect.objectContaining({ status: 'failed', terminalSequence: 4 }),
    ]);
  });

  it('keeps every run of an action re-run on the same source', () => {
    const first = service.applyEvent(null, requested('exec-1', 3));
    const failed = service.applyEvent(
      first as never,
      terminal('run.failed', 'exec-1', 4, { error: 'Nope.' }),
    );
    const retried = service.applyEvent(failed as never, requested('exec-2', 6));

    expect(retried.uiActionRuns).toEqual([
      expect.objectContaining({ runId: 'exec-1', status: 'failed' }),
      expect.objectContaining({ runId: 'exec-2', status: 'pending' }),
    ]);
  });

  it('settles two runs queued on the same source by their own terminal events', () => {
    const queued = (runId: string, sequence: number) =>
      ({
        commandId: `turn-queued:thread-1:${runId}`,
        payload: { uiAction: { action: 'approve_plan', sourceId: 'plan-1' } },
        runId,
        sequence,
        threadId: 'thread-1',
        type: 'thread.turn_queued',
      }) as never;
    const events = [
      queued('exec-a', 1),
      queued('exec-b', 2),
      terminal('run.completed', 'exec-a', 5),
      terminal('run.failed', 'exec-b', 7, {
        error: 'This plan has already been approved.',
      }),
    ];
    const snapshot = events.reduce(
      (current, event) => service.applyEvent(current as never, event),
      null as unknown,
    ) as { uiActionRuns: AgentThreadUiActionRun[] };

    expect(snapshot.uiActionRuns).toEqual([
      expect.objectContaining({ runId: 'exec-a', status: 'completed' }),
      expect.objectContaining({ runId: 'exec-b', status: 'failed' }),
    ]);
    expect(
      deriveAgentUiActionStates(snapshot.uiActionRuns)['approve_plan:plan-1'],
    ).toMatchObject({ runId: 'exec-a', status: 'completed' });
  });

  it('drops the oldest settled runs past the cap, never a pending one', () => {
    let snapshot: unknown = service.applyEvent(null, requested('pending', 1));
    for (let index = 0; index < 60; index += 1) {
      snapshot = service.applyEvent(
        snapshot as never,
        requested(`run-${index}`, 2 + index * 2, `card-${index}`),
      );
      snapshot = service.applyEvent(
        snapshot as never,
        terminal('run.completed', `run-${index}`, 3 + index * 2),
      );
    }
    const runs = (snapshot as { uiActionRuns: AgentThreadUiActionRun[] })
      .uiActionRuns;

    expect(runs).toHaveLength(50);
    expect(runs[0]?.runId).toBe('pending');
    expect(runs.at(-1)?.runId).toBe('run-59');
  });

  it('drops a superseded run past the cap before the run a card shows', () => {
    const events = [
      requested('exec-a', 1),
      terminal('run.completed', 'exec-a', 2),
      requested('exec-b', 3),
      terminal('run.failed', 'exec-b', 4, { error: 'Already approved.' }),
      ...Array.from({ length: 49 }, (_, index) => [
        requested(`run-${index}`, 5 + index * 2, `card-${index + 2}`),
        terminal('run.completed', `run-${index}`, 6 + index * 2),
      ]).flat(),
    ];
    const snapshot = events.reduce(
      (current, event) => service.applyEvent(current as never, event),
      null as unknown,
    ) as { uiActionRuns: AgentThreadUiActionRun[] };

    expect(snapshot.uiActionRuns).toHaveLength(50);
    expect(snapshot.uiActionRuns.map((run) => run.runId)).not.toContain(
      'exec-b',
    );
    expect(
      deriveAgentUiActionStates(snapshot.uiActionRuns)[
        'confirm_generate_media:card-1'
      ],
    ).toMatchObject({ runId: 'exec-a', status: 'completed' });
  });

  it('does not track turns that are not ui-actions', () => {
    const snapshot = service.applyEvent(null, {
      commandId: 'turn-requested:thread-1:exec-9',
      payload: { content: 'Hello' },
      runId: 'exec-9',
      sequence: 1,
      threadId: 'thread-1',
      type: 'thread.turn_requested',
    } as never);

    expect(snapshot.uiActionRuns).toEqual([]);
  });
});
