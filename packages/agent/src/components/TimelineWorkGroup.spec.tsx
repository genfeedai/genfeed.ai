import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@cloud/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@cloud/agent/utils/derive-timeline';
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

vi.mock('./TimelineWorkEntry', () => ({
  TimelineWorkEntry: function MockEntry({
    event,
    stopActiveAnimation,
  }: {
    event: { id: string };
    stopActiveAnimation?: boolean;
  }) {
    return (
      <div>{`entry-${event.id}-${stopActiveAnimation ? 'stopped' : 'active'}`}</div>
    );
  },
}));

vi.mock('./ToolCallDetailPanel', () => ({
  ToolCallDetailPanel: () => null,
}));

vi.mock('../utils/format-duration', () => ({
  formatDuration: () => '1.0s',
}));

import { TimelineWorkGroup } from './TimelineWorkGroup';

function buildEntry(eventCount: number): TimelineWorkGroupEntry {
  return {
    createdAt: '2026-03-18T10:00:00.000Z',
    events: Array.from({ length: eventCount }, (_, i) => ({
      createdAt: '2026-03-18T10:00:00.000Z',
      event: AgentWorkEventType.TOOL_COMPLETED,
      id: `e-${i}`,
      label: `Tool ${i}`,
      status: AgentWorkEventStatus.COMPLETED,
      threadId: 't1',
    })),
    id: 'wg-1',
    kind: 'work-group',
    presentation: 'live',
    totalDurationMs: 1000,
  };
}

describe('TimelineWorkGroup', () => {
  it('renders step count', () => {
    render(<TimelineWorkGroup entry={buildEntry(5)} />);
    expect(screen.getByText(/5 steps/)).toBeTruthy();
  });

  it('shows all entries for live groups', () => {
    render(<TimelineWorkGroup entry={buildEntry(5)} />);
    const entries = screen.getAllByText(/^entry-e-/);
    expect(entries).toHaveLength(5);
    expect(screen.getByText('entry-e-0-active')).toBeTruthy();
    expect(screen.getByText('entry-e-1-active')).toBeTruthy();
    expect(screen.getByText('entry-e-2-active')).toBeTruthy();
    expect(screen.getByText('entry-e-3-active')).toBeTruthy();
    expect(screen.getByText('entry-e-4-active')).toBeTruthy();
    expect(screen.queryByText(/Show .* more/)).toBeNull();
  });

  it('single event shows "1 step"', () => {
    render(<TimelineWorkGroup entry={buildEntry(1)} />);
    expect(screen.getByText(/1 step(?!s)/)).toBeTruthy();
  });

  it('renders archived groups collapsed by default with completion header', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildEntry(4),
          presentation: 'archived',
          totalDurationMs: 237000,
        }}
      />,
    );

    expect(screen.getByText('Worked for 3m 57s')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.queryByText('entry-e-0-active')).toBeNull();
  });

  it('expands and collapses archived groups from the compact header', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildEntry(2),
          presentation: 'archived',
          totalDurationMs: 4200,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Worked for 4s/i }));
    expect(screen.getByText('entry-e-0-active')).toBeTruthy();
    expect(screen.getByText('entry-e-1-active')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Worked for 4s/i }));
    expect(screen.queryByText('entry-e-0-active')).toBeNull();
  });

  it('stops animating stale active steps after a terminal event', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildEntry(3),
          events: [
            {
              createdAt: '2026-03-18T10:00:00.000Z',
              event: AgentWorkEventType.STARTED,
              id: 'e-running',
              label: 'Run Started',
              status: AgentWorkEventStatus.RUNNING,
              threadId: 't1',
            },
            {
              createdAt: '2026-03-18T10:00:01.000Z',
              event: AgentWorkEventType.TOOL_STARTED,
              id: 'e-pending',
              label: 'Check Onboarding',
              status: AgentWorkEventStatus.PENDING,
              threadId: 't1',
            },
            {
              createdAt: '2026-03-18T10:00:02.000Z',
              event: AgentWorkEventType.FAILED,
              id: 'e-failed',
              label: 'Run Failed',
              status: AgentWorkEventStatus.FAILED,
              threadId: 't1',
            },
          ],
          presentation: 'live',
          totalDurationMs: 2000,
        }}
      />,
    );

    expect(screen.getByText('entry-e-running-stopped')).toBeTruthy();
    expect(screen.getByText('entry-e-pending-stopped')).toBeTruthy();
    expect(screen.getByText('entry-e-failed-active')).toBeTruthy();
  });
});
