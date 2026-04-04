import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';
import { mapSnapshotWorkEvents } from './agent-thread-snapshot.util';

describe('mapSnapshotWorkEvents', () => {
  it('maps completed work timeline entries to completed run events', () => {
    const [event] = mapSnapshotWorkEvents({
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
      timeline: [
        {
          createdAt: '2026-03-24T10:00:00.000Z',
          id: 'evt-1',
          kind: 'work',
          label: 'Run completed',
          payload: {},
          runId: 'run-1',
          sequence: 1,
          status: 'completed',
        },
      ],
      title: null,
    });

    expect(event.event).toBe(AgentWorkEventType.COMPLETED);
    expect(event.status).toBe(AgentWorkEventStatus.COMPLETED);
  });

  it('maps tool start entries without explicit status as running', () => {
    const [event] = mapSnapshotWorkEvents({
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
      timeline: [
        {
          createdAt: '2026-03-24T10:00:00.000Z',
          id: 'evt-2',
          kind: 'tool',
          label: 'Tool started',
          payload: { sourceEventType: 'tool.started' },
          runId: 'run-1',
          sequence: 2,
          toolName: 'check_onboarding_status',
        },
      ],
      title: null,
    });

    expect(event.event).toBe(AgentWorkEventType.TOOL_STARTED);
    expect(event.status).toBe(AgentWorkEventStatus.RUNNING);
  });

  it('maps resolved input entries to submitted events', () => {
    const [event] = mapSnapshotWorkEvents({
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
      timeline: [
        {
          createdAt: '2026-03-24T10:00:00.000Z',
          id: 'evt-3',
          kind: 'input',
          label: 'Input resolved',
          payload: { sourceEventType: 'input.resolved' },
          requestId: 'request-1',
          sequence: 3,
          status: 'completed',
        },
      ],
      title: null,
    });

    expect(event.event).toBe(AgentWorkEventType.INPUT_SUBMITTED);
    expect(event.status).toBe(AgentWorkEventStatus.COMPLETED);
  });

  it('restores tool identity from work timeline payloads', () => {
    const [event] = mapSnapshotWorkEvents({
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
      timeline: [
        {
          createdAt: '2026-03-24T10:00:00.000Z',
          id: 'evt-4',
          kind: 'work',
          label: 'check_onboarding_status',
          payload: {
            event: 'tool_completed',
            sourceEventType: 'work.updated',
            toolCallId: 'tool-call-1',
            toolName: 'check_onboarding_status',
          },
          runId: 'run-1',
          sequence: 4,
          status: 'failed',
        },
      ],
      title: null,
    });

    expect(event.event).toBe(AgentWorkEventType.TOOL_COMPLETED);
    expect(event.status).toBe(AgentWorkEventStatus.FAILED);
    expect(event.toolCallId).toBe('tool-call-1');
    expect(event.toolName).toBe('check_onboarding_status');
  });
});
