import '@testing-library/jest-dom/vitest';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DashboardAgentCards,
  DashboardRecentActivity,
  DashboardRecentTasks,
  DashboardStatsStrip,
  WorkspaceDashboard,
} from './workspace-dashboard';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/demo/FUDNEWS${path}`,
  }),
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

vi.mock('@ui/overview/OverviewTrendsPanel', () => ({
  OverviewTrendsPanel: ({
    isLoading,
    trends,
    viewAllHref,
  }: {
    isLoading: boolean;
    trends: unknown[];
    viewAllHref: string;
  }) => (
    <div data-testid="overview-trends-panel">
      <a href={viewAllHref}>View All</a>
      {isLoading ? (
        <div data-testid="trends-loading">Loading</div>
      ) : trends.length === 0 ? (
        <div data-testid="trends-empty">No trends yet.</div>
      ) : null}
    </div>
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

function makeExecution(
  overrides: Partial<IWorkflowExecution> = {},
): IWorkflowExecution {
  return {
    createdAt: '2026-05-20T07:00:00.000Z',
    creditsUsed: 0,
    id: 'run-1',
    inputValues: {},
    nodeResults: [],
    organizationId: 'org-1',
    progress: 0,
    status: WorkflowExecutionStatus.RUNNING,
    trigger: WorkflowExecutionTrigger.MANUAL,
    updatedAt: '2026-05-20T07:30:00.000Z',
    userId: 'user-1',
    workflow: { id: 'workflow-1', label: 'Writer Agent Run' },
    workflowId: 'workflow-1',
    ...overrides,
  };
}

function makeStats(
  overrides: Partial<WorkflowExecutionStats> = {},
): WorkflowExecutionStats {
  return {
    active: 0,
    completed: 0,
    failed: 0,
    total: 0,
    totalCredits: 0,
    ...overrides,
  };
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
    const { container } = render(
      <DashboardAgentCards
        activeExecutions={[
          makeExecution(),
          makeExecution({
            id: 'run-2',
            status: WorkflowExecutionStatus.PENDING,
            workflow: { id: 'workflow-2', label: 'Video Agent Run' },
          }),
          makeExecution({
            id: 'run-3',
            status: WorkflowExecutionStatus.FAILED,
            workflow: { id: 'workflow-3', label: 'Image Agent Run' },
          }),
          makeExecution({
            id: 'run-4',
            status: WorkflowExecutionStatus.RUNNING,
            workflow: { id: 'workflow-4', label: 'Caption Agent Run' },
          }),
        ]}
        executions={[
          makeExecution({
            id: 'run-5',
            status: WorkflowExecutionStatus.COMPLETED,
            workflow: { id: 'workflow-5', label: 'Done Run' },
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
      '/demo/FUDNEWS/automation/runs',
    );

    // Regression (#1229): execution cards must use the shared Card tokens,
    // never the lighter bespoke background-secondary/tertiary grays.
    expect(container.querySelector('.bg-background-secondary')).toBeNull();
    expect(container.querySelector('.bg-background-tertiary')).toBeNull();
  });

  it('returns no agent cards when there are no executions', () => {
    const { container } = render(
      <DashboardAgentCards activeExecutions={[]} executions={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders stats with trend fallbacks', () => {
    render(
      <DashboardStatsStrip
        activeExecutions={[
          makeExecution({
            id: 'run-1',
            status: WorkflowExecutionStatus.RUNNING,
          }),
          makeExecution({
            id: 'run-2',
            status: WorkflowExecutionStatus.PENDING,
          }),
        ]}
        reviewInbox={{
          approvedCount: 2,
          changesRequestedCount: 1,
          pendingCount: 3,
          readyCount: 4,
          recentItems: [],
          rejectedCount: 0,
        }}
        stats={makeStats({
          active: 5,
          completed: 7,
          failed: 1,
          total: 13,
          totalCredits: 12.345,
        })}
        workspaceTasks={[
          makeTask({ id: 'task-1', status: 'backlog' }),
          makeTask({ id: 'task-2', status: 'in_progress' }),
        ]}
      />,
    );

    expect(screen.getByText('Workflows Active')).toBeVisible();
    expect(screen.getByText('Tasks In Progress')).toBeVisible();
    expect(screen.getByText('Pending Approvals')).toBeVisible();
    // Credits are deliberately absent from the strip — the topbar already shows
    // the live balance, so repeating it here read as a duplicate meter.
    expect(screen.queryByText('Credits Used')).toBeNull();
    expect(screen.queryByText('12.35')).toBeNull();
    // The dense chart grid moved to automation/runs — see RunChartsGrid.
    expect(screen.queryByText('Run Activity')).toBeNull();
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
        activeExecutions={[makeExecution()]}
        reviewInbox={{
          approvedCount: 1,
          changesRequestedCount: 0,
          pendingCount: 1,
          readyCount: 1,
          recentItems: [],
          rejectedCount: 0,
        }}
        executions={[
          makeExecution({
            id: 'run-2',
            status: WorkflowExecutionStatus.COMPLETED,
          }),
        ]}
        stats={makeStats({ active: 1, completed: 1, total: 2 })}
        workspaceTasks={[makeTask() as never]}
      />,
    );

    expect(screen.getByTestId('dashboard-agents')).toBeVisible();
    expect(screen.getByTestId('dashboard-stats-strip')).toBeVisible();
    expect(screen.getByText('Recent Activity')).toBeVisible();
    expect(screen.getByText('Recent Tasks')).toBeVisible();
    expect(screen.getByTestId('overview-trends-panel')).toBeVisible();
  });

  it('renders the trends panel with the configured viewAllHref', () => {
    render(
      <WorkspaceDashboard
        activeExecutions={[]}
        reviewInbox={{
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        }}
        executions={[]}
        stats={makeStats()}
        trendsHref="/org/brand/discovery/overview"
        trendItems={[]}
        // One task is enough signal to get past the first-run block below.
        workspaceTasks={[makeTask() as never]}
      />,
    );

    const trendsPanel = screen.getByTestId('overview-trends-panel');
    expect(trendsPanel.querySelector('a')).toHaveAttribute(
      'href',
      '/org/brand/discovery/overview',
    );
  });

  it('collapses an empty brand into a single guided first-run block', () => {
    render(
      <WorkspaceDashboard
        activeExecutions={[]}
        reviewInbox={{
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        }}
        executions={[]}
        stats={makeStats()}
        trendsHref="/org/brand/discovery/overview"
        trendItems={[]}
        workspaceTasks={[]}
      />,
    );

    expect(screen.getByTestId('workspace-dashboard-first-run')).toBeVisible();
    // The stacked empty bands it replaces must not render alongside it.
    expect(screen.queryByTestId('dashboard-stats-strip')).toBeNull();
    expect(screen.queryByTestId('overview-trends-panel')).toBeNull();
    expect(screen.queryByText('Recent Activity')).toBeNull();
  });

  it('keeps the composed dashboard while data is still loading', () => {
    render(
      <WorkspaceDashboard
        activeExecutions={[]}
        isTasksLoading
        reviewInbox={{
          approvedCount: 0,
          changesRequestedCount: 0,
          pendingCount: 0,
          readyCount: 0,
          recentItems: [],
          rejectedCount: 0,
        }}
        executions={[]}
        stats={makeStats()}
        trendItems={[]}
        workspaceTasks={[]}
      />,
    );

    expect(screen.queryByTestId('workspace-dashboard-first-run')).toBeNull();
    expect(screen.getByTestId('dashboard-stats-strip')).toBeVisible();
  });
});
