import { TimelineStreamingRow } from '@genfeedai/agent/components/TimelineStreamingRow';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: function MockButton(props: {
    children?: ReactNode;
    onClick?: () => void;
  }) {
    return (
      <button type="button" onClick={props.onClick}>
        {props.children}
      </button>
    );
  },
}));

vi.mock('./ToolCallDetailPanel', () => ({
  ToolCallDetailPanel: () => <div>detail-panel</div>,
}));

function buildEntry(
  overrides?: Partial<Parameters<typeof TimelineStreamingRow>[0]['entry']>,
) {
  return {
    id: 'streaming-entry',
    kind: 'streaming' as const,
    runDurationLabel: '4s',
    streamState: {
      activeToolCalls: [],
      isStreaming: true,
      streamingContent: '',
      streamingReasoning: '',
    },
    workEvents: [],
    ...overrides,
  };
}

describe('TimelineStreamingRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows productized research progress instead of raw reasoning text', () => {
    render(
      <TimelineStreamingRow
        entry={buildEntry({
          streamState: {
            activeToolCalls: [
              {
                id: 'tool-1',
                name: 'get_sources',
                startedAt: '2026-03-23T12:00:00.000Z',
                status: 'running',
              },
            ],
            isStreaming: true,
            streamingContent: '',
            streamingReasoning:
              'Searching across sources for evidence.\nThen comparing results line by line.',
          },
        })}
      />,
    );

    // T3 density: a running tool paints the turn as a work entry, so the
    // status header is suppressed and raw reasoning text never renders.
    expect(screen.getByText('Get Sources')).toBeTruthy();
    expect(screen.queryByText('get_sources')).toBeNull();
    expect(
      screen.queryByText('Then comparing results line by line.'),
    ).toBeNull();
    expect(
      screen.queryByText('Searching across sources for evidence.'),
    ).toBeNull();
  });

  it('shows waiting-for-input state from active work events', () => {
    render(
      <TimelineStreamingRow
        entry={buildEntry({
          workEvents: [
            {
              createdAt: '2026-03-23T12:00:00.000Z',
              detail: 'Choose the export format.',
              event: AgentWorkEventType.INPUT_REQUESTED,
              id: 'input-1',
              inputRequestId: 'input-1',
              label: 'Awaiting input',
              runId: 'run-1',
              status: AgentWorkEventStatus.RUNNING,
              threadId: 'thread-1',
            },
          ],
        })}
      />,
    );

    // The input request renders once as a work entry; the status header is
    // suppressed when a meaningful event already paints the turn.
    expect(screen.getByText('Input Required')).toBeTruthy();
    expect(screen.getAllByText('Choose the export format.')).toHaveLength(1);
  });

  it('reveals streaming answer text progressively', () => {
    render(
      <TimelineStreamingRow
        entry={buildEntry({
          streamState: {
            activeToolCalls: [],
            isStreaming: true,
            streamingContent: 'Fast streamed answer',
            streamingReasoning: '',
          },
        })}
      />,
    );

    expect(screen.queryByText('Fast streamed answer')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(220);
    });

    expect(screen.getByText('Fast streamed answer')).toBeTruthy();
  });

  it('renders thinking status with Working for duration at the end', () => {
    render(<TimelineStreamingRow entry={buildEntry()} />);

    expect(screen.getByLabelText('Thinking')).toBeTruthy();
    expect(screen.getByText('Working for 4s')).toBeTruthy();
  });

  it('does not render tool work events twice when active tool calls exist', () => {
    render(
      <TimelineStreamingRow
        entry={buildEntry({
          streamState: {
            activeToolCalls: [
              {
                id: 'tool-1',
                name: 'check_onboarding_status',
                startedAt: '2026-03-23T12:00:00.000Z',
                status: 'running',
              },
            ],
            isStreaming: true,
            streamingContent: '',
            streamingReasoning: '',
          },
          workEvents: [
            {
              createdAt: '2026-03-23T12:00:01.000Z',
              detail: 'Running check_onboarding_status',
              event: AgentWorkEventType.TOOL_STARTED,
              id: 'work-tool-1',
              label: 'Check Onboarding',
              runId: 'run-1',
              status: AgentWorkEventStatus.RUNNING,
              threadId: 'thread-1',
              toolCallId: 'tool-1',
              toolName: 'check_onboarding_status',
            },
          ],
        })}
      />,
    );

    // The active tool call owns the entry; its mirrored work event (same
    // toolCallId) is dropped instead of rendering the turn twice.
    expect(screen.getAllByText('Check Onboarding')).toHaveLength(1);
    expect(screen.queryByText('Running check_onboarding_status')).toBeNull();
  });
});
