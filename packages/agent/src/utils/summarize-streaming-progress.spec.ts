import {
  type AgentToolCall,
  type AgentWorkEvent,
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { describe, expect, it } from 'vitest';
import { summarizeStreamingProgress } from './summarize-streaming-progress';

function toolCall(
  name: string,
  status: AgentToolCall['status'] = 'running',
): AgentToolCall {
  return {
    arguments: {},
    id: name,
    name,
    status,
  };
}

function workEvent(overrides: Partial<AgentWorkEvent> = {}): AgentWorkEvent {
  return {
    createdAt: '2026-08-14T00:00:00.000Z',
    event: AgentWorkEventType.TOOL_STARTED,
    id: 'event-1',
    label: 'Working',
    status: AgentWorkEventStatus.RUNNING,
    threadId: 'thread-1',
    ...overrides,
  };
}

const idleStream = {
  activeToolCalls: [] as AgentToolCall[],
  isStreaming: true,
  streamingContent: '',
  streamingReasoning: '',
};

describe('summarizeStreamingProgress', () => {
  it('labels an input request as waiting', () => {
    expect(
      summarizeStreamingProgress(idleStream, [
        workEvent({
          detail: 'Pick a brand',
          event: AgentWorkEventType.INPUT_REQUESTED,
          status: AgentWorkEventStatus.PENDING,
        }),
      ]),
    ).toEqual({
      detail: 'Pick a brand',
      label: 'Waiting for input',
    });
  });

  it('maps tool-name prefixes to progress labels', () => {
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('get_trends')] },
        [],
      ).label,
    ).toBe('Researching');
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('rate_post')] },
        [],
      ).label,
    ).toBe('Reviewing');
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('generate_image')] },
        [],
      ).label,
    ).toBe('Generating');
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('schedule_post')] },
        [],
      ).label,
    ).toBe('Preparing outputs');
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('connect_x')] },
        [],
      ).label,
    ).toBe('Updating workspace');
    expect(
      summarizeStreamingProgress(
        { ...idleStream, activeToolCalls: [toolCall('unknown_tool')] },
        [],
      ).label,
    ).toBe('Thinking');
  });

  it('ignores completed tool calls and prefers the latest active one', () => {
    expect(
      summarizeStreamingProgress(
        {
          ...idleStream,
          activeToolCalls: [
            toolCall('get_trends', 'completed'),
            toolCall('create_post'),
          ],
        },
        [],
      ).label,
    ).toBe('Generating');
  });

  it('uses answering when content is streaming and no tool is active', () => {
    expect(
      summarizeStreamingProgress(
        { ...idleStream, streamingContent: 'Here is a draft' },
        [],
      ),
    ).toEqual({ label: 'Answering' });
  });

  it('truncates long reasoning into a thinking detail', () => {
    const reasoning = `1. ${'x'.repeat(120)}`;

    expect(
      summarizeStreamingProgress(
        { ...idleStream, streamingReasoning: reasoning },
        [],
      ),
    ).toEqual({
      detail: `${'x'.repeat(85).trimEnd()}...`,
      label: 'Thinking',
    });
  });

  it('labels a submitted input as reviewing', () => {
    expect(
      summarizeStreamingProgress(idleStream, [
        workEvent({
          detail: 'Brand selected',
          event: AgentWorkEventType.INPUT_SUBMITTED,
        }),
      ]),
    ).toEqual({
      detail: 'Brand selected',
      label: 'Reviewing',
    });
  });
});
