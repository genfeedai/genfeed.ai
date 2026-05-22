import '@testing-library/jest-dom';
import { AgentExecutionStatus } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DashboardAgentCards,
  DashboardChartsGrid,
  DashboardRecentActivity,
  DashboardRecentTasks,
  DashboardStatsStrip,
  WorkspaceDashboard,
} from './workspace-dashboard';

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => () => {
    void loader;
    return <div data-testid="chart-piece" />;
  },
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
  }) => (
    <section className={className} data-body-class={bodyClassName}>
      {children}
    </section>
  ),
}));

vi.mock('@ui/dashboard/DashboardGrid', () => ({
  DashboardGrid: ({ children }: { children: ReactNode }) => (
    <div data-testid="dashboard-grid">{children}</div>
  ),
}));

vi.mock('@ui/primitives/button', () => ({
  Button: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('@ui/primitives/table', () => ({
  Table: ({ children }: { children: ReactNode }) => <table>{children}</table>,
  TableBody: ({ children }: { children: ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  TableCell: ({ children }: { children: ReactNode }) => <td>{children}</td>,
  TableHead: ({ children }: { children: ReactNode }) => <th>{children}</th>,
  TableHeader: ({ children }: { children: ReactNode }) => (
    <thead>{children}</thead>
  ),
  TableRow: ({ children }: { children: ReactNode }) => <tr>{children}</tr>,
}));

function makeRun(overrides: Partial<IAgentRun> = {}): IAgentRun {
  return {
    id: 'run-1',
    label: 'Writer Agent Run',
    metadata: {
      agentName: 'Writer',
    },
    objective: 'Draft launch copy',
    status: AgentExecutionStatus.RUNNING,
    summary: 'Done',
    ...overrides,
  } as IAgentRun;
}

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: '2026-05-20T07:00:00.000Z',
    eventStream: [],
    id: 'task-1',
    progress: { message: 'Working' },
    request: 'Create launch content',
    reviewState: 'none',
    status: 'in_progress',
    title: 'Launch content',
    updatedAt: '2026-05-20T07:30:00.000Z',
    ...overrides,
  };
}

describe('workspace dashboard sections', () => {
  it('renders agent cards with live, queued, completed, and view-all states', () => {
    render(
      <DashboardAgentCards
        activeRuns={[
          makeRun(),
          makeRun({
            id: 'run-2',
            label: 'Video Agent Run',
            metadata: {},
            status: AgentExecutionStatus.PENDING,
          }),
          makeRun({
            id: 'run-3',
            label: 'Image Agent Run',
            status: AgentExecutionStatus.FAILED,
          }),
          makeRun({
            id: 'run-4',
            label: 'Caption Agent Run',
            status: AgentExecutionStatus.RUNNING,
          }),
        ]}
        runs={[
          makeRun({
            id: 'run-5',
            label: 'Done Run',
            status: AgentExecutionStatus.COMPLETED,
          }),
        ]}
      />,
    );

    expect(screen.getByTestId('dashboard-agents')).toBeVisible();
    expect(screen.getByText('Live now')).toBeVisible();
    expect(screen.getByText('Queued')).toBeVisible();
    expect(screen.getByText('Failed')).toBeVisible();
    expect(screen.getByText('View All')).toHaveAttribute(
      'href',
      '/orchestration/runs',
    );
  });

  it('returns no agent cards when there are no runs', () => {
    const { container } = render(
      <DashboardAgentCards activeRuns={[]} runs={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders stats and charts with trend fallbacks', () => {
    const runs = [
      makeRun({ id: 'run-1', status: AgentExecutionStatus.RUNNING }),
      makeRun({ id: 'run-2', status: AgentExecutionStatus.PENDING }),
    ];

    render(
      <>
        <DashboardStatsStrip
          activeRuns={runs}
          reviewInbox={{
            approvedCount: 2,
            changesRequestedCount: 1,
            pendingCount: 3,
            readyCount: 4,
            recentItems: [],
            rejectedCount: 0,
          }}
          stats={{
            activeRuns: 5,
            completedToday: 7,
            failedToday: 1,
            totalCreditsToday: 12.345,
            trends: [
              {
                autoRoutedRate: 1.25,
                bucket: '2026-05-20T00:00:00.000Z',
                totalCreditsUsed: 2.345,
                totalRuns: 9,
              },
            ],
          }}
          workspaceTasks={[
            makeTask({ id: 'task-1', status: 'backlog' }),
            makeTask({ id: 'task-2', status: 'in_progress' }),
          ]}
        />
        <DashboardChartsGrid
          runs={runs}
          stats={{
            trends: [
              {
                autoRoutedRate: 0.75,
                bucket: '2026-05-20T00:00:00.000Z',
                totalCreditsUsed: 3.456,
                totalRuns: 4,
              },
            ],
          }}
        />
      </>,
    );

    expect(screen.getByText('Agents Active')).toBeVisible();
    expect(screen.getByText('12.35')).toBeVisible();
    expect(screen.getByText('Run Activity')).toBeVisible();
    expect(screen.getByText('Success Rate')).toBeVisible();
    expect(screen.getAllByTestId('chart-piece').length).toBeGreaterThan(0);
  });

  it('omits charts when there are no runs or trends', () => {
    const { container } = render(
      <DashboardChartsGrid runs={[]} stats={null} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders recent activity and task rows with empty states and status variants', () => {
    const tasks = [
      makeTask({
        eventStream: [
          {
            payload: { summary: 'Summary event' },
            type: 'task_ready_for_review',
          },
        ],
        id: 'task-1',
        status: 'failed',
        title: 'Failed image task',
      }),
      makeTask({
        eventStream: [
          {
            payload: { message: 'Message event' },
            type: 'task_queued',
          },
        ],
        id: 'task-2',
        reviewState: 'pending_approval',
        status: 'in_review',
        title: 'Review video task',
      }),
      makeTask({
        eventStream: [],
        id: 'task-3',
        progress: undefined,
        status: 'done',
        title: 'Done caption task',
      }),
    ];

    render(
      <>
        <DashboardRecentActivity workspaceTasks={tasks as never} />
        <DashboardRecentTasks workspaceTasks={tasks as never} />
        <DashboardRecentActivity workspaceTasks={[]} />
        <DashboardRecentTasks workspaceTasks={[]} />
      </>,
    );

    expect(screen.getAllByText('Recent Activity').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Failed image task').length).toBeGreaterThan(0);
    expect(screen.getByText('Summary event')).toBeVisible();
    expect(screen.getByText('Message event')).toBeVisible();
    expect(screen.getByText('No activity yet.')).toBeVisible();
    expect(screen.getByText('No recent tasks.')).toBeVisible();
  });

  it('renders the composed workspace dashboard', () => {
    render(
      <WorkspaceDashboard
        activeRuns={[makeRun()]}
        reviewInbox={{
          approvedCount: 1,
          changesRequestedCount: 0,
          pendingCount: 1,
          readyCount: 1,
          recentItems: [],
          rejectedCount: 0,
        }}
        runs={[
          makeRun({ id: 'run-2', status: AgentExecutionStatus.COMPLETED }),
        ]}
        stats={null}
        workspaceTasks={[makeTask() as never]}
      />,
    );

    expect(screen.getByTestId('dashboard-agents')).toBeVisible();
    expect(screen.getByTestId('dashboard-stats-strip')).toBeVisible();
    expect(screen.getByText('Recent Activity')).toBeVisible();
    expect(screen.getByText('Recent Tasks')).toBeVisible();
  });
});
