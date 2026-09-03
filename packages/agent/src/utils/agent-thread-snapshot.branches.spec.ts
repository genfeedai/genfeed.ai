import type { AgentThreadSnapshot } from '@genfeedai/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';
import {
  buildThreadSummaryFromSnapshot,
  mapSnapshotPendingInputRequest,
  mapSnapshotRunStatus,
  mapSnapshotWorkEvents,
} from './agent-thread-snapshot.util';

type TimelineEntry = AgentThreadSnapshot['timeline'][number];

function makeSnapshot(
  overrides: Partial<AgentThreadSnapshot> = {},
): AgentThreadSnapshot {
  return {
    activeRun: null,
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
    ...overrides,
  } as AgentThreadSnapshot;
}

function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    createdAt: '2026-03-24T10:00:00.000Z',
    id: 'evt-1',
    kind: 'work',
    label: 'Working',
    payload: {},
    runId: 'run-1',
    sequence: 1,
    status: null,
    ...overrides,
  } as TimelineEntry;
}

describe('mapSnapshotRunStatus', () => {
  it('maps every known status', () => {
    expect(mapSnapshotRunStatus('queued')).toBe('running');
    expect(mapSnapshotRunStatus('running')).toBe('running');
    expect(mapSnapshotRunStatus('waiting_input')).toBe('awaiting_input');
    expect(mapSnapshotRunStatus('completed')).toBe('completed');
    expect(mapSnapshotRunStatus('failed')).toBe('failed');
    expect(mapSnapshotRunStatus('cancelled')).toBe('cancelled');
    expect(mapSnapshotRunStatus('unknown')).toBe('idle');
    expect(mapSnapshotRunStatus(null)).toBe('idle');
    expect(mapSnapshotRunStatus(undefined)).toBe('idle');
  });
});

describe('mapSnapshotWorkEvents event mapping', () => {
  function mapSingle(entry: TimelineEntry, live = true) {
    const snapshot = makeSnapshot({
      activeRun: live ? { runId: 'run-1', status: 'running' } : null,
      timeline: [entry],
    });
    return mapSnapshotWorkEvents(snapshot)[0];
  }

  it('honors explicit payload event names', () => {
    const event = mapSingle(
      makeEntry({
        payload: { event: AgentWorkEventType.TOOL_COMPLETED },
        status: 'completed',
      }),
    );

    expect(event?.event).toBe(AgentWorkEventType.TOOL_COMPLETED);
  });

  it('maps sourceEventType values to event types', () => {
    const cases: Array<[string, AgentWorkEventType]> = [
      ['tool.started', AgentWorkEventType.TOOL_STARTED],
      ['tool.progress', AgentWorkEventType.TOOL_STARTED],
      ['tool.completed', AgentWorkEventType.TOOL_COMPLETED],
      ['input.requested', AgentWorkEventType.INPUT_REQUESTED],
      ['input.resolved', AgentWorkEventType.INPUT_SUBMITTED],
      ['run.completed', AgentWorkEventType.COMPLETED],
      ['work.completed', AgentWorkEventType.COMPLETED],
      ['run.failed', AgentWorkEventType.FAILED],
      ['run.cancelled', AgentWorkEventType.CANCELLED],
      ['thread.turn_started', AgentWorkEventType.STARTED],
      ['work.started', AgentWorkEventType.STARTED],
      ['work.updated', AgentWorkEventType.STARTED],
    ];

    for (const [sourceEventType, expected] of cases) {
      const event = mapSingle(makeEntry({ payload: { sourceEventType } }));
      expect(event?.event).toBe(expected);
    }
  });

  it('derives tool events from kind and status', () => {
    expect(mapSingle(makeEntry({ kind: 'tool' }))?.event).toBe(
      AgentWorkEventType.TOOL_STARTED,
    );
    expect(
      mapSingle(makeEntry({ kind: 'tool', status: 'failed' }))?.event,
    ).toBe(AgentWorkEventType.TOOL_COMPLETED);
  });

  it('derives input events from kind and status', () => {
    expect(mapSingle(makeEntry({ kind: 'input' }))?.event).toBe(
      AgentWorkEventType.INPUT_REQUESTED,
    );
    expect(
      mapSingle(makeEntry({ kind: 'input', status: 'completed' }))?.event,
    ).toBe(AgentWorkEventType.INPUT_SUBMITTED);
  });

  it('derives work events from status and label heuristics', () => {
    expect(
      mapSingle(makeEntry({ kind: 'work', status: 'failed' }))?.event,
    ).toBe(AgentWorkEventType.FAILED);
    expect(
      mapSingle(makeEntry({ kind: 'work', status: 'cancelled' }))?.event,
    ).toBe(AgentWorkEventType.CANCELLED);
    expect(
      mapSingle(makeEntry({ kind: 'work', label: 'Run completed' }))?.event,
    ).toBe(AgentWorkEventType.COMPLETED);
    expect(
      mapSingle(makeEntry({ kind: 'work', label: 'Generation failed' }))?.event,
    ).toBe(AgentWorkEventType.FAILED);
    expect(
      mapSingle(makeEntry({ kind: 'work', label: 'Run cancelled' }))?.event,
    ).toBe(AgentWorkEventType.CANCELLED);
    expect(mapSingle(makeEntry({ kind: 'work' }))?.event).toBe(
      AgentWorkEventType.STARTED,
    );
  });

  it('maps error entries to failed and drops unknown kinds', () => {
    expect(mapSingle(makeEntry({ kind: 'error', label: 'Boom' }))?.event).toBe(
      AgentWorkEventType.FAILED,
    );

    const snapshot = makeSnapshot({
      timeline: [makeEntry({ kind: 'unknown' as TimelineEntry['kind'] })],
    });
    expect(mapSnapshotWorkEvents(snapshot)).toEqual([]);
  });

  it('maps status vocabulary variants', () => {
    expect(mapSingle(makeEntry({ status: 'succeeded' }))?.status).toBe(
      AgentWorkEventStatus.COMPLETED,
    );
    expect(mapSingle(makeEntry({ status: 'error' }))?.status).toBe(
      AgentWorkEventStatus.FAILED,
    );
    expect(mapSingle(makeEntry({ status: 'canceled' }))?.status).toBe(
      AgentWorkEventStatus.CANCELLED,
    );
    expect(mapSingle(makeEntry({ status: 'queued' }))?.status).toBe(
      AgentWorkEventStatus.PENDING,
    );
    expect(
      mapSingle(makeEntry({ payload: { sourceEventType: 'error.raised' } }))
        ?.status,
    ).toBe(AgentWorkEventStatus.FAILED);
    expect(
      mapSingle(makeEntry({ payload: { sourceEventType: 'run.cancelled' } }))
        ?.status,
    ).toBe(AgentWorkEventStatus.CANCELLED);
    expect(mapSingle(makeEntry({ label: 'Step completed' }))?.status).toBe(
      AgentWorkEventStatus.COMPLETED,
    );
    expect(mapSingle(makeEntry({ label: 'Step failed' }))?.status).toBe(
      AgentWorkEventStatus.FAILED,
    );
    expect(mapSingle(makeEntry({ label: 'Step cancelled' }))?.status).toBe(
      AgentWorkEventStatus.CANCELLED,
    );
    expect(
      mapSingle(makeEntry({ kind: 'input', label: 'Waiting' }))?.status,
    ).toBe(AgentWorkEventStatus.PENDING);
  });

  it('copies structured payload fields onto the event', () => {
    const event = mapSingle(
      makeEntry({
        kind: 'tool',
        payload: {
          estimatedDurationMs: 60000,
          inputRequestId: 'req-1',
          parameters: { prompt: 'hello' },
          phase: 'render',
          progress: 40,
          remainingDurationMs: 30000,
          resultSummary: 'done soon',
          startedAt: '2026-03-24T10:00:00.000Z',
          toolCallId: 'call-1',
          toolName: 'generate_image',
        },
      }),
    );

    expect(event).toMatchObject({
      estimatedDurationMs: 60000,
      inputRequestId: 'req-1',
      parameters: { prompt: 'hello' },
      phase: 'render',
      progress: 40,
      remainingDurationMs: 30000,
      resultSummary: 'done soon',
      startedAt: '2026-03-24T10:00:00.000Z',
      threadId: 'thread-1',
      toolCallId: 'call-1',
      toolName: 'generate_image',
    });
  });

  it('settles running events when the run is over', () => {
    const snapshot = makeSnapshot({
      activeRun: { runId: 'run-1', status: 'completed' },
      timeline: [makeEntry({ kind: 'tool', status: 'running' })],
    });

    const [event] = mapSnapshotWorkEvents(snapshot);
    expect(event?.status).toBe(AgentWorkEventStatus.COMPLETED);
  });

  it('keeps pending input requests live even after the run settles', () => {
    const snapshot = makeSnapshot({
      pendingInputRequests: [
        {
          createdAt: '2026-03-24T10:00:00.000Z',
          options: [],
          prompt: 'Pick one',
          requestId: 'req-live',
          title: 'Choice',
        },
      ],
      timeline: [
        makeEntry({
          id: 'evt-input',
          kind: 'input',
          payload: { inputRequestId: 'req-live' },
          status: 'pending',
        }),
        makeEntry({ id: 'evt-tool', kind: 'tool', status: 'running' }),
      ],
    });

    const events = mapSnapshotWorkEvents(snapshot);
    expect(events[0]?.status).toBe(AgentWorkEventStatus.PENDING);
    expect(events[1]?.status).toBe(AgentWorkEventStatus.COMPLETED);
  });
});

describe('mapSnapshotPendingInputRequest', () => {
  it('returns null without pending requests', () => {
    expect(mapSnapshotPendingInputRequest(makeSnapshot())).toBeNull();
  });

  it('maps the newest pending request', () => {
    const snapshot = makeSnapshot({
      pendingInputRequests: [
        {
          createdAt: '2026-03-24T09:00:00.000Z',
          options: [],
          prompt: 'Old',
          requestId: 'req-1',
          title: 'Old request',
        },
        {
          allowFreeText: true,
          createdAt: '2026-03-24T10:00:00.000Z',
          fieldId: 'field-1',
          metadata: { source: 'test' },
          options: [{ id: 'opt-1', label: 'Option 1' }],
          prompt: 'Pick one',
          recommendedOptionId: 'opt-1',
          requestId: 'req-2',
          title: 'New request',
        },
      ],
    });

    expect(mapSnapshotPendingInputRequest(snapshot)).toEqual({
      allowFreeText: true,
      fieldId: 'field-1',
      inputRequestId: 'req-2',
      metadata: { source: 'test' },
      options: [{ id: 'opt-1', label: 'Option 1' }],
      prompt: 'Pick one',
      recommendedOptionId: 'opt-1',
      threadId: 'thread-1',
      title: 'New request',
    });
  });
});

describe('buildThreadSummaryFromSnapshot', () => {
  it('flags needs-input when input requests are pending', () => {
    const summary = buildThreadSummaryFromSnapshot(
      makeSnapshot({
        pendingInputRequests: [
          {
            createdAt: '2026-03-24T10:00:00.000Z',
            options: [],
            prompt: 'Pick',
            requestId: 'req-1',
            title: 'Choice',
          },
        ],
      }),
    );

    expect(summary.attentionState).toBe('needs-input');
    expect(summary.runStatus).toBe('waiting_input');
    expect(summary.pendingInputCount).toBe(1);
  });

  it('counts pending plan approval as needing input', () => {
    const summary = buildThreadSummaryFromSnapshot(
      makeSnapshot({
        latestProposedPlan: {
          awaitingApproval: true,
        } as AgentThreadSnapshot['latestProposedPlan'],
      }),
    );

    expect(summary.attentionState).toBe('needs-input');
    expect(summary.pendingInputCount).toBe(1);
  });

  it('marks hidden running threads as running and visible ones as null', () => {
    const snapshot = makeSnapshot({
      activeRun: {
        runId: 'run-1',
        startedAt: '2026-03-24T10:00:00.000Z',
        status: 'running',
      },
    });

    expect(buildThreadSummaryFromSnapshot(snapshot).attentionState).toBe(
      'running',
    );
    expect(
      buildThreadSummaryFromSnapshot(snapshot, { isVisible: true })
        .attentionState,
    ).toBeNull();
  });

  it('marks hidden threads with new assistant output as updated', () => {
    const snapshot = makeSnapshot({
      lastAssistantMessage: {
        content: 'A'.repeat(400),
        createdAt: '2026-03-24T10:00:00.000Z',
        messageId: 'msg-1',
      },
    });

    const summary = buildThreadSummaryFromSnapshot(snapshot);
    expect(summary.attentionState).toBe('updated');
    expect(summary.lastAssistantPreview).toHaveLength(280);
    expect(summary.lastActivityAt).toBe('2026-03-24T10:00:00.000Z');
  });

  it('copies the latest generated asset from assistant metadata', () => {
    const summary = buildThreadSummaryFromSnapshot(
      makeSnapshot({
        lastAssistantMessage: {
          content: 'Portraits are ready',
          createdAt: '2026-03-24T10:00:00.000Z',
          messageId: 'msg-1',
          metadata: {
            uiActions: [
              {
                id: 'gen-1',
                images: ['https://cdn.test/portrait.png'],
                title: 'Portraits',
                type: 'content_preview_card',
              },
            ],
          },
        },
      }),
    );

    expect(summary.lastGeneratedAssetUrl).toBe('https://cdn.test/portrait.png');
  });

  it('falls back through activity timestamps', () => {
    const withRun = buildThreadSummaryFromSnapshot(
      makeSnapshot({
        activeRun: {
          completedAt: '2026-03-24T11:00:00.000Z',
          runId: 'run-1',
          startedAt: '2026-03-24T10:00:00.000Z',
          status: 'completed',
        },
      }),
    );
    expect(withRun.lastActivityAt).toBe('2026-03-24T11:00:00.000Z');

    const withExisting = buildThreadSummaryFromSnapshot(makeSnapshot(), {
      existingThread: {
        contextVersion: 1,
        createdAt: '2026-03-20T10:00:00.000Z',
        id: 'thread-1',
        lastActivityAt: '2026-03-23T10:00:00.000Z',
        status: 'active',
        title: 'Thread',
        updatedAt: '2026-03-22T10:00:00.000Z',
      } as never,
    });
    expect(withExisting.lastActivityAt).toBe('2026-03-23T10:00:00.000Z');

    const withNow = buildThreadSummaryFromSnapshot(makeSnapshot(), {
      now: '2026-03-25T10:00:00.000Z',
    });
    expect(withNow.lastActivityAt).toBe('2026-03-25T10:00:00.000Z');
  });
});
