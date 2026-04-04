import type {
  AgentChatMessage,
  AgentWorkEvent,
} from '@cloud/agent/models/agent-chat.model';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';
import type { TimelineStreaming } from './derive-timeline';
import { deriveTimeline } from './derive-timeline';

const idleStream: TimelineStreaming['streamState'] = {
  activeToolCalls: [],
  isStreaming: false,
  streamingContent: '',
  streamingReasoning: '',
};

function msg(
  role: 'user' | 'assistant',
  id: string,
  createdAt: string,
  metadata?: Record<string, unknown>,
) {
  return {
    content: `${role} ${id}`,
    createdAt,
    id,
    metadata,
    role,
    threadId: 't1',
  } as AgentChatMessage;
}

function workEvent(
  overrides: Partial<AgentWorkEvent> & { id: string; createdAt: string },
) {
  return {
    event: AgentWorkEventType.TOOL_COMPLETED,
    label: 'Tool',
    status: AgentWorkEventStatus.COMPLETED,
    threadId: 't1',
    ...overrides,
  } as AgentWorkEvent;
}

describe('deriveTimeline', () => {
  it('returns empty array for empty state', () => {
    const result = deriveTimeline([], [], idleStream, null);
    expect(result).toEqual([]);
  });

  it('returns user + assistant entries sorted by createdAt', () => {
    const messages = [
      msg('assistant', 'a1', '2026-01-01T00:00:02Z'),
      msg('user', 'u1', '2026-01-01T00:00:01Z'),
      msg('user', 'u2', '2026-01-01T00:00:03Z'),
    ];

    const result = deriveTimeline(messages, [], idleStream, null);

    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('user-message');
    expect(result[0].id).toBe('msg-u1');
    expect(result[1].kind).toBe('assistant-message');
    expect(result[1].id).toBe('msg-a1');
    expect(result[2].kind).toBe('user-message');
    expect(result[2].id).toBe('msg-u2');
  });

  it('interleaves work events as work-group between user and assistant messages', () => {
    const messages = [
      msg('user', 'u1', '2026-01-01T00:00:01Z'),
      msg('assistant', 'a1', '2026-01-01T00:00:05Z'),
    ];
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        id: 'w1',
        runId: 'r1',
        toolName: 'search',
      }),
    ];

    const result = deriveTimeline(messages, events, idleStream, null);

    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('user-message');
    expect(result[1].kind).toBe('work-group');
    expect(result[2].kind).toBe('assistant-message');
  });

  it('tie-breaks work-group before assistant-message at same timestamp', () => {
    const ts = '2026-01-01T00:00:02Z';
    const messages = [
      msg('user', 'u1', '2026-01-01T00:00:01Z'),
      msg('assistant', 'a1', ts),
    ];
    const events = [
      workEvent({ createdAt: ts, id: 'w1', runId: 'r1', toolName: 'search' }),
    ];

    const result = deriveTimeline(messages, events, idleStream, null);

    expect(result).toHaveLength(3);
    expect(result[0].kind).toBe('user-message');
    expect(result[1].kind).toBe('work-group');
    expect(result[2].kind).toBe('assistant-message');
  });

  it('enriches work events with metadata.toolCalls data', () => {
    const messages = [
      msg('user', 'u1', '2026-01-01T00:00:01Z'),
      msg('assistant', 'a1', '2026-01-01T00:00:05Z', {
        toolCalls: [
          {
            arguments: {},
            durationMs: 1234,
            id: 'tc1',
            name: 'search',
            resultSummary: 'Found 5 results',
            status: 'completed',
          },
        ],
      }),
    ];
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        id: 'w1',
        runId: 'r1',
        toolName: 'search',
      }),
    ];

    const result = deriveTimeline(messages, events, idleStream, null);

    const workGroup = result.find((e) => e.kind === 'work-group');
    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      const enriched = workGroup.events[0];
      expect(enriched.durationMs).toBe(1234);
      expect(enriched.resultSummary).toBe('Found 5 results');
    }
  });

  it('appends streaming entry when stream is active', () => {
    const activeStream: TimelineStreaming['streamState'] = {
      activeToolCalls: [],
      isStreaming: true,
      streamingContent: 'Thinking...',
      streamingReasoning: '',
    };

    const result = deriveTimeline([], [], activeStream, '3s');

    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('streaming');
    if (result[0].kind === 'streaming') {
      expect(result[0].streamState.streamingContent).toBe('Thinking...');
      expect(result[0].runDurationLabel).toBe('3s');
    }
  });

  it('includes input request events in work groups', () => {
    const messages = [msg('user', 'u1', '2026-01-01T00:00:01Z')];
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:02Z',
        event: AgentWorkEventType.INPUT_REQUESTED,
        id: 'w1',
        inputRequestId: 'ir1',
        label: 'Needs approval',
        runId: 'r1',
      }),
    ];

    const result = deriveTimeline(messages, events, idleStream, null);

    expect(result).toHaveLength(2);
    const workGroup = result.find((e) => e.kind === 'work-group');
    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      expect(workGroup.events[0].event).toBe(
        AgentWorkEventType.INPUT_REQUESTED,
      );
      expect(workGroup.events[0].inputRequestId).toBe('ir1');
    }
  });

  it('does not duplicate between historical and streaming entries', () => {
    const activeStream: TimelineStreaming['streamState'] = {
      activeToolCalls: [],
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
    };

    const messages = [msg('user', 'u1', '2026-01-01T00:00:01Z')];
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:02Z',
        id: 'w-done',
        runId: 'r1',
        status: AgentWorkEventStatus.COMPLETED,
        toolName: 'search',
      }),
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        id: 'w-running',
        runId: 'r1',
        status: AgentWorkEventStatus.RUNNING,
        toolName: 'generate',
      }),
    ];

    const result = deriveTimeline(messages, events, activeStream, '5s');

    // Completed event goes to work-group, running event goes to streaming
    const workGroups = result.filter((e) => e.kind === 'work-group');
    const streamingEntries = result.filter((e) => e.kind === 'streaming');

    expect(workGroups).toHaveLength(1);
    expect(streamingEntries).toHaveLength(1);

    if (workGroups[0].kind === 'work-group') {
      expect(workGroups[0].events).toHaveLength(1);
      expect(workGroups[0].events[0].id).toBe('w-done');
    }

    if (streamingEntries[0].kind === 'streaming') {
      expect(streamingEntries[0].workEvents).toHaveLength(1);
      expect(streamingEntries[0].workEvents[0].id).toBe('w-running');
    }
  });

  it('filters generic run lifecycle rows when specific step events exist', () => {
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:02Z',
        event: AgentWorkEventType.STARTED,
        id: 'w-start',
        label: 'Run started',
        runId: 'r1',
        status: AgentWorkEventStatus.RUNNING,
      }),
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        id: 'w-tool',
        label: 'Check Onboarding',
        runId: 'r1',
        status: AgentWorkEventStatus.COMPLETED,
        toolName: 'check_onboarding_status',
      }),
      workEvent({
        createdAt: '2026-01-01T00:00:04Z',
        event: AgentWorkEventType.COMPLETED,
        id: 'w-complete',
        label: 'Run completed',
        runId: 'r1',
        status: AgentWorkEventStatus.COMPLETED,
      }),
    ];

    const result = deriveTimeline([], events, idleStream, null);
    const workGroup = result.find((entry) => entry.kind === 'work-group');

    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      expect(workGroup.events).toHaveLength(1);
      expect(workGroup.events[0].id).toBe('w-tool');
      expect(workGroup.presentation).toBe('live');
    }
  });

  it('collapses repeated tool lifecycle events into one visible step', () => {
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:02Z',
        detail: 'Starting check_onboarding_status',
        event: AgentWorkEventType.TOOL_STARTED,
        id: 'w-tool-start',
        label: 'Check Onboarding',
        runId: 'r1',
        status: AgentWorkEventStatus.RUNNING,
        toolCallId: 'tc-1',
        toolName: 'check_onboarding_status',
      }),
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        detail: 'Schema has not been registered for model "User".',
        event: AgentWorkEventType.TOOL_COMPLETED,
        id: 'w-tool-complete',
        label: 'Check Onboarding',
        runId: 'r1',
        status: AgentWorkEventStatus.FAILED,
        toolCallId: 'tc-1',
        toolName: 'check_onboarding_status',
      }),
    ];

    const result = deriveTimeline([], events, idleStream, null);
    const workGroup = result.find((entry) => entry.kind === 'work-group');

    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      expect(workGroup.events).toHaveLength(1);
      expect(workGroup.events[0].id).toBe('w-tool-start');
      expect(workGroup.events[0].status).toBe(AgentWorkEventStatus.FAILED);
      expect(workGroup.events[0].event).toBe(AgentWorkEventType.TOOL_COMPLETED);
      expect(workGroup.events[0].detail).toBe(
        'Schema has not been registered for model "User".',
      );
      expect(workGroup.presentation).toBe('live');
    }
  });

  it('archives completed work groups when a following assistant message exists', () => {
    const messages = [
      msg('user', 'u1', '2026-01-01T00:00:01Z'),
      msg('assistant', 'a1', '2026-01-01T00:00:05Z'),
    ];
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        durationMs: 1800,
        id: 'w1',
        runId: 'r1',
        startedAt: '2026-01-01T00:00:02Z',
        status: AgentWorkEventStatus.COMPLETED,
        toolName: 'search',
      }),
    ];

    const result = deriveTimeline(messages, events, idleStream, null);
    const workGroup = result.find((entry) => entry.kind === 'work-group');

    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      expect(workGroup.presentation).toBe('archived');
      expect(workGroup.totalDurationMs).toBe(1000);
    }
  });

  it('keeps completed work groups live when no assistant message follows', () => {
    const events = [
      workEvent({
        createdAt: '2026-01-01T00:00:03Z',
        id: 'w1',
        runId: 'r1',
        status: AgentWorkEventStatus.COMPLETED,
        toolName: 'search',
      }),
    ];

    const result = deriveTimeline([], events, idleStream, null);
    const workGroup = result.find((entry) => entry.kind === 'work-group');

    expect(workGroup).toBeDefined();
    if (workGroup?.kind === 'work-group') {
      expect(workGroup.presentation).toBe('live');
    }
  });
});
