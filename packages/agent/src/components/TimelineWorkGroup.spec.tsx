import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@genfeedai/agent/utils/derive-timeline';
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

function buildLiveEntry(eventCount: number): TimelineWorkGroupEntry {
  return {
    createdAt: '2026-03-18T10:00:00.000Z',
    events: Array.from({ length: eventCount }, (_, i) => ({
      createdAt: '2026-03-18T10:00:00.000Z',
      event: AgentWorkEventType.TOOL_STARTED,
      id: `e-${i}`,
      label: `Tool ${i}`,
      status:
        i === eventCount - 1
          ? AgentWorkEventStatus.RUNNING
          : AgentWorkEventStatus.COMPLETED,
      threadId: 't1',
      toolName: `tool_${i}`,
    })),
    id: 'wg-1',
    kind: 'work-group',
    presentation: 'live',
    totalDurationMs: 1000,
  };
}

function buildSettledEntry(eventCount: number): TimelineWorkGroupEntry {
  return {
    createdAt: '2026-03-18T10:00:00.000Z',
    events: Array.from({ length: eventCount }, (_, i) => ({
      createdAt: '2026-03-18T10:00:00.000Z',
      event: AgentWorkEventType.TOOL_COMPLETED,
      id: `e-${i}`,
      label: `Tool ${i}`,
      status: AgentWorkEventStatus.COMPLETED,
      threadId: 't1',
      toolName: `tool_${i}`,
    })),
    id: 'wg-1',
    kind: 'work-group',
    presentation: 'archived',
    totalDurationMs: 1000,
  };
}

describe('TimelineWorkGroup', () => {
  it('renders step count at the trailing duration line for live groups', () => {
    render(<TimelineWorkGroup entry={buildLiveEntry(5)} />);
    expect(screen.getByText(/5 steps/)).toBeTruthy();
    expect(screen.getByText(/Working for/i)).toBeTruthy();
  });

  it('shows all real steps for live groups above the duration footer', () => {
    render(<TimelineWorkGroup entry={buildLiveEntry(5)} />);
    const entries = screen.getAllByText(/^entry-e-/);
    expect(entries).toHaveLength(5);
    expect(screen.getByText('entry-e-0-active')).toBeTruthy();
    expect(screen.getByText('entry-e-4-active')).toBeTruthy();
  });

  it('single event shows "1 step"', () => {
    render(<TimelineWorkGroup entry={buildLiveEntry(1)} />);
    expect(screen.getByText(/1 step(?!s)/)).toBeTruthy();
  });

  it('hides generic lifecycle bookends from the step list', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildLiveEntry(1),
          events: [
            {
              createdAt: '2026-03-18T10:00:00.000Z',
              event: AgentWorkEventType.STARTED,
              id: 'e-started',
              label: 'Agent started',
              status: AgentWorkEventStatus.RUNNING,
              threadId: 't1',
            },
            {
              createdAt: '2026-03-18T10:00:01.000Z',
              event: AgentWorkEventType.TOOL_STARTED,
              id: 'e-tool',
              label: 'Research',
              status: AgentWorkEventStatus.RUNNING,
              threadId: 't1',
              toolName: 'research',
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText(/entry-e-started/)).toBeNull();
    expect(screen.getByText('entry-e-tool-active')).toBeTruthy();
    expect(screen.getByText(/1 step(?!s)/)).toBeTruthy();
  });

  it('renders settled groups collapsed with trailing Worked for duration', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(4),
          totalDurationMs: 237000,
        }}
      />,
    );

    expect(screen.getByText('Worked for 3m 57s')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.queryByText('entry-e-0-active')).toBeNull();
  });

  it('expands and collapses settled groups from the trailing duration row', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(2),
          totalDurationMs: 4200,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Worked for 4s/i }));
    expect(screen.getByText('entry-e-0-active')).toBeTruthy();
    expect(screen.getByText('entry-e-1-active')).toBeTruthy();
    expect(screen.getByText('Worked for 4s')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Worked for 4s/i }));
    expect(screen.queryByText('entry-e-0-active')).toBeNull();
  });

  it('treats stale lifecycle running as settled when a terminal event exists', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(1),
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
              toolName: 'check_onboarding',
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

    // Lifecycle hidden; tool pending + failed visible when expanded/open for failure
    expect(screen.queryByText(/entry-e-running/)).toBeNull();
    expect(screen.getByText('Worked for 2s')).toBeTruthy();
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('keeps duration neutral on failed runs (only Failed is semantic red)', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(1),
          // Keep a real tool step: lifecycle-only residue is suppressed
          // entirely (#2538), so the failed run needs a product row to show.
          events: [
            ...buildSettledEntry(1).events,
            {
              createdAt: '2026-03-18T10:00:00.000Z',
              event: AgentWorkEventType.FAILED,
              id: 'e-failed',
              label: 'Run Failed',
              status: AgentWorkEventStatus.FAILED,
              threadId: 't1',
            },
          ],
          totalDurationMs: 547,
        }}
      />,
    );

    const group = screen.getByTestId('timeline-work-group');
    expect(group.className).not.toMatch(/destructive/);
    expect(screen.getByText('Worked for 547ms').className).toMatch(
      /text-gray-900/,
    );
    expect(screen.getByText('Worked for 547ms').className).not.toMatch(
      /\btext-muted\b/,
    );
    expect(screen.getByText('Worked for 547ms').className).not.toMatch(
      /\btext-secondary\b/,
    );
    expect(screen.getByText('Failed').className).toMatch(/text-destructive/);
  });

  it('paints step count as muted text, not muted fill', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(2),
          events: [
            ...buildSettledEntry(2).events,
            {
              createdAt: '2026-03-18T10:00:00.000Z',
              detail: 'provider returned empty output',
              event: AgentWorkEventType.FAILED,
              id: 'e-failed',
              label: 'Run Failed',
              status: AgentWorkEventStatus.FAILED,
              threadId: 't1',
            },
          ],
          totalDurationMs: 4000,
        }}
      />,
    );

    expect(screen.getByText('2 steps').className).toMatch(/text-gray-800/);
    expect(screen.getByText('2 steps').className).not.toMatch(/\btext-muted\b/);
  });

  it('keeps the collapsed label free of error copy so the chevron stays aligned', () => {
    render(
      <TimelineWorkGroup
        entry={{
          ...buildSettledEntry(1),
          events: [
            ...buildSettledEntry(1).events,
            {
              createdAt: '2026-03-18T10:00:00.000Z',
              detail: 'Nodes failed: generate_image',
              event: AgentWorkEventType.FAILED,
              id: 'e-failed',
              label: 'Run Failed',
              status: AgentWorkEventStatus.FAILED,
              threadId: 't1',
            },
          ],
          totalDurationMs: 1472000,
        }}
      />,
    );

    const toggle = screen.getByRole('button', { name: /Worked for 24m 32s/i });
    expect(toggle).toHaveTextContent('Failed');
    expect(toggle).toHaveTextContent('1 step');
    expect(toggle).not.toHaveTextContent('Nodes failed');
    expect(screen.getByTestId('timeline-work-group-chevron')).toBeTruthy();
  });
});
