import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { EnrichedWorkEvent } from '@genfeedai/agent/utils/derive-timeline';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('./AgentToolCallDisplay', () => ({
  TOOL_LABELS: { generate_image: 'Generate Image' } as Record<string, string>,
}));

vi.mock('./ToolCallDetailPanel', () => ({
  ToolCallDetailPanel: (props: {
    debug?: { rawOutput?: string };
    error?: string;
  }) => (
    <div>
      detail-panel
      {props.error ? <span>{props.error}</span> : null}
      {props.debug?.rawOutput ? <span>{props.debug.rawOutput}</span> : null}
    </div>
  ),
}));

vi.mock('../utils/format-duration', () => ({
  formatDuration: () => '1.5s',
}));

import { TimelineWorkEntry } from './TimelineWorkEntry';

function buildEvent(overrides?: Partial<EnrichedWorkEvent>): EnrichedWorkEvent {
  return {
    createdAt: '2026-03-18T10:00:00.000Z',
    event: AgentWorkEventType.TOOL_COMPLETED,
    id: 'ev-1',
    label: 'Generate Image',
    status: AgentWorkEventStatus.COMPLETED,
    threadId: 't1',
    toolName: 'generate_image',
    ...overrides,
  };
}

describe('TimelineWorkEntry', () => {
  it('renders label from TOOL_LABELS', () => {
    render(<TimelineWorkEntry event={buildEvent()} />);
    expect(screen.getByText('Generate Image')).toBeTruthy();
  });

  it('shows status icons', () => {
    const { container: completedContainer } = render(
      <TimelineWorkEntry event={buildEvent()} />,
    );
    expect(completedContainer.querySelector('svg')).toBeTruthy();

    const { container: runningContainer } = render(
      <TimelineWorkEntry
        event={buildEvent({ status: AgentWorkEventStatus.RUNNING })}
      />,
    );
    expect(runningContainer.querySelector('div.animate-spin')).toBeTruthy();

    const { container: stoppedContainer } = render(
      <TimelineWorkEntry
        event={buildEvent({ status: AgentWorkEventStatus.RUNNING })}
        stopActiveAnimation
      />,
    );
    expect(stoppedContainer.querySelector('div.animate-spin')).toBeNull();
  });

  it('truncates long detail', () => {
    const longDetail =
      'This is a very long detail string that exceeds sixty characters and should be truncated with an ellipsis';
    render(<TimelineWorkEntry event={buildEvent({ detail: longDetail })} />);
    expect(screen.getByText(/\.\.\./)).toBeTruthy();
  });

  it('shows duration', () => {
    render(<TimelineWorkEntry event={buildEvent({ durationMs: 1500 })} />);
    expect(screen.getByText('1.5s')).toBeTruthy();
  });

  it('expands detail panel on click when enriched data available', () => {
    render(
      <TimelineWorkEntry event={buildEvent({ parameters: { foo: 'bar' } })} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('detail-panel')).toBeTruthy();
  });

  it('expands hidden debug output instead of showing it inline', () => {
    render(
      <TimelineWorkEntry
        event={buildEvent({
          debug: { rawOutput: 'structured debug output' },
          resultSummary: 'Completed successfully',
        })}
      />,
    );

    expect(screen.queryByText('structured debug output')).toBeNull();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('structured debug output')).toBeTruthy();
  });
});
