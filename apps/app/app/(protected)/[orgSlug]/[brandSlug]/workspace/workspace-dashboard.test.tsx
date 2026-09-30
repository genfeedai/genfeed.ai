import '@testing-library/jest-dom/vitest';
import { translateFromPseudoCatalog } from '@app-tests/next-intl.stub';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/contracts';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardAgentCards,
  DashboardRecentActivity,
  DashboardRecentTasks,
  DashboardStatsStrip,
  WorkspaceDashboard,
} from './workspace-dashboard';

const localeMocks = vi.hoisted(() => ({ isPseudo: false }));

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/demo/FUDNEWS${path}`,
  }),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog, translateFromPseudoCatalog } = await import(
    '@app-tests/next-intl.stub'
  );
  return {
    useTranslations: (namespace: string) =>
      (localeMocks.isPseudo
        ? translateFromPseudoCatalog
        : translateFromCatalog)(namespace),
  };
});

vi.mock('next/link', () => ({
  default: ({
    'aria-label': ariaLabel,
    children,
    href,
  }: {
    'aria-label'?: string;
    children: ReactNode;
    href: string;
  }) => (
    <a aria-label={ariaLabel} href={href}>
      {children}
    </a>
  ),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({
    bodyClassName,
    children,
    className,
    'data-testid': dataTestId,
  }: {
    bodyClassName?: string;
    children: ReactNode;
    className?: string;
    'data-testid'?: string;
  }) => (
    <section
      className={className}
      data-body-class={bodyClassName}
      data-testid={dataTestId}
    >
      {children}
    </section>
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
    completedToday: 0,
    failedToday: 0,
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
  beforeEach(() => {
    vi.restoreAllMocks();
    localeMocks.isPseudo = false;
  });

  it.each([
    [30_000, 'justNow', {}],
    [5 * 60_000, 'minutesAgo', { minutes: 5 }],
    [3 * 3_600_000, 'hoursAgo', { hours: 3 }],
    [2 * 86_400_000, 'daysAgo', { days: 2 }],
    [null, 'unknown', {}],
    ['invalid', 'unknown', {}],
  ] as const)(
    'localizes both recent-panel timestamps: %s',
    (age, key, values) => {
      localeMocks.isPseudo = true;
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-30T10:00:00Z'));
      const source =
        typeof age === 'number'
          ? new Date(Date.now() - age).toISOString()
          : age;
      const task = makeTask({ createdAt: source, updatedAt: source });
      const { container } = render(
        <>
          <DashboardRecentActivity workspaceTasks={[task] as never} />
          <DashboardRecentTasks workspaceTasks={[task] as never} />
        </>,
      );
      const translate = translateFromPseudoCatalog('pages.workspaceOverview');
      const expected = translateFromPseudoCatalog(
        'pages.workspaceOverview.relativeTime',
      )(key, values);
      expect(screen.getByText(translate('recentActivity.title'))).toBeVisible();
      expect(screen.getByText(translate('recentTasks.title'))).toBeVisible();
      expect(container.textContent).not.toContain('NaN');
      const timestamps = container.querySelectorAll(
        'span[class~="text-foreground/35"]',
      );
      expect(timestamps).toHaveLength(2);
      for (const timestamp of timestamps)
        expect(timestamp.textContent).toBe(expected);
    },
  );

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
    expect(screen.getByText('View all')).toHaveAttribute(
      'href',
      '/demo/FUDNEWS/automation/runs',
    );

    // Regression (#1229): execution cards must use the shared Card tokens,
    // never the lighter bespoke background-secondary/tertiary grays.
    expect(container.querySelector('.bg-background-secondary')).toBeNull();
    expect(container.querySelector('.bg-background-tertiary')).toBeNull();
  });

  it('renders flat run cards with one fact line and a single Open action', () => {
    const { container } = render(
      <DashboardAgentCards
        activeExecutions={[
          makeExecution({ creditsUsed: 12, progress: 40 }),
          makeExecution({
            error: 'Node render-video timed out',
            id: 'run-2',
            status: WorkflowExecutionStatus.FAILED,
            workflow: { id: 'workflow-2', label: 'Video Agent Run' },
          }),
        ]}
        executions={[]}
      />,
    );

    const section = screen.getByTestId('dashboard-agents');
    expect(
      within(section).getByRole('heading', { name: 'Running agents' }),
    ).toBeVisible();

    const cards = screen.getAllByTestId('workflow-execution-card');
    expect(cards).toHaveLength(2);

    for (const card of cards) {
      // One visible action per card, and nothing nested in a filled box.
      expect(within(card).getAllByRole('link')).toHaveLength(1);
      expect(card.querySelector('[class*="bg-muted"]')).toBeNull();
      expect(card.querySelector('[class*="bg-secondary"]')).toBeNull();
      expect(card.querySelector('[class~="rounded"]')).toBeNull();
    }

    expect(
      within(cards[0]).getByRole('link', { name: 'Open Writer Agent Run' }),
    ).toHaveAttribute('href', '/demo/FUDNEWS/automation/runs/run-1');
    expect(cards[0]).toHaveTextContent('40% done · 12 credits');
    expect(cards[1]).toHaveTextContent('Node render-video timed out');
    // The label appears once — the old nested box repeated it.
    expect(within(cards[0]).getAllByText('Writer Agent Run')).toHaveLength(1);

    // Columns follow the container, not the viewport.
    expect(container.querySelector('.\\@container')).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:sm|md|lg|xl):grid-cols-/);
  });

  it('labels terminal run statuses from the message catalog', () => {
    render(
      <DashboardAgentCards
        activeExecutions={[]}
        executions={[
          makeExecution({
            id: 'run-1',
            status: WorkflowExecutionStatus.COMPLETED,
          }),
          makeExecution({
            id: 'run-2',
            status: WorkflowExecutionStatus.FAILED,
          }),
          makeExecution({
            id: 'run-3',
            status: WorkflowExecutionStatus.CANCELLED,
          }),
        ]}
      />,
    );

    const cards = screen.getAllByTestId('workflow-execution-card');
    expect(within(cards[0]).getByText('Completed')).toBeVisible();
    expect(within(cards[1]).getByText('Failed')).toBeVisible();
    expect(within(cards[2]).getByText('Cancelled')).toBeVisible();
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
          completedToday: 0,
          failedToday: 0,
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

    // Panels share the container-query card grid, not the stat-tile ladder.
    const panels = screen.getByTestId('dashboard-panels');
    expect(panels.firstElementChild).toHaveClass('grid', 'gap-4');
    expect(
      within(panels).getByTestId('overview-trends-panel'),
    ).toBeInTheDocument();
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
