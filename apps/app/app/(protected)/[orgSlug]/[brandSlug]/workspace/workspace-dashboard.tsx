'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  ComponentSize,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  IWorkflowExecution,
  SurfaceSummaryItem,
} from '@genfeedai/contracts/interfaces';
import type { WorkflowExecutionStats } from '@genfeedai/contracts/types';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
import Badge from '@ui/display/badge/Badge';
import { OverviewTrendsPanel } from '@ui/overview/OverviewTrendsPanel';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { ArrowRight, Cpu } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { WorkspaceTaskRowsSkeleton } from './workspace-task-loading';

interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: unknown[];
  rejectedCount: number;
}

interface DashboardProps {
  activeExecutions: IWorkflowExecution[];
  executions: IWorkflowExecution[];
  isExecutionsLoading?: boolean;
  isTasksLoading?: boolean;
  isTrendsLoading?: boolean;
  reviewInbox: ReviewInboxSummary;
  stats: WorkflowExecutionStats;
  trendsHref?: string;
  trendItems?: TrendItem[];
  workspaceTasks: Task[];
}

function formatRelativeTime(date: string): string {
  const delta = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatOptionalRelativeTime(date?: string | null): string {
  return date ? formatRelativeTime(date) : 'unknown';
}

function formatStatusLabel(status: WorkflowExecutionStatus): string {
  const normalized = status.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function WorkflowExecutionCard({
  execution,
}: {
  execution: IWorkflowExecution;
}) {
  const { href } = useOrgUrl();
  const statusLabel =
    execution.status === WorkflowExecutionStatus.RUNNING
      ? 'Live now'
      : execution.status === WorkflowExecutionStatus.PENDING
        ? 'Queued'
        : formatStatusLabel(execution.status);

  const label = execution.workflow?.label ?? execution.workflowId;

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className="group"
      bodyClassName="gap-2 p-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded border border-border bg-muted">
            <Cpu className="size-3.5 text-foreground/60" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{label}</p>
            <Badge
              status={execution.status.toLowerCase()}
              size={ComponentSize.SM}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Link
            href={href(`${APP_ROUTES.AUTOMATION.RUNS}/${execution.id}`)}
            aria-label={`Open ${label}`}
          >
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="rounded border border-border bg-muted/50 px-2.5 py-2">
        <p className="line-clamp-1 text-xs font-medium text-foreground/75">
          {label}
        </p>
        <p className="mt-0.5 line-clamp-2 text-2xs font-mono text-foreground/45">
          {execution.status === WorkflowExecutionStatus.RUNNING ||
          execution.status === WorkflowExecutionStatus.PENDING
            ? 'Workflow nodes are executing.'
            : (execution.error ?? 'Workflow execution completed.')}
        </p>
      </div>
    </Card>
  );
}

export function DashboardAgentCards({
  activeExecutions,
  executions,
  isLoading = false,
}: {
  activeExecutions: IWorkflowExecution[];
  executions: IWorkflowExecution[];
  isLoading?: boolean;
}) {
  const { href } = useOrgUrl();
  const displayExecutions = useMemo(() => {
    const active = activeExecutions.slice(0, 3);
    if (active.length >= 3) return active;

    const recentCompleted = executions
      .filter(
        (execution) =>
          !activeExecutions.some((active) => active.id === execution.id) &&
          execution.status !== WorkflowExecutionStatus.PENDING,
      )
      .slice(0, 3 - active.length);

    return [...active, ...recentCompleted];
  }, [activeExecutions, executions]);

  if (displayExecutions.length === 0 && !isLoading) {
    return null;
  }

  return (
    <section data-testid="dashboard-agents">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-foreground">
          Running Agents
        </h2>
        {(activeExecutions.length > 3 || executions.length > 3) && (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
          >
            <Link href={href(APP_ROUTES.AUTOMATION.RUNS)}>View All</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && displayExecutions.length === 0
          ? [
              'agent-run-skeleton-1',
              'agent-run-skeleton-2',
              'agent-run-skeleton-3',
            ].map((key) => (
              <Card key={key} variant={CardVariant.DEFAULT} bodyClassName="p-3">
                <WorkspaceTaskRowsSkeleton rows={1} />
              </Card>
            ))
          : displayExecutions.map((execution) => (
              <WorkflowExecutionCard execution={execution} key={execution.id} />
            ))}
      </div>
    </section>
  );
}

export function DashboardStatsStrip({
  activeExecutions,
  isExecutionsLoading = false,
  isTasksLoading = false,
  reviewInbox,
  stats,
  workspaceTasks,
}: {
  activeExecutions: IWorkflowExecution[];
  isExecutionsLoading?: boolean;
  isTasksLoading?: boolean;
  reviewInbox: ReviewInboxSummary;
  stats: WorkflowExecutionStats;
  workspaceTasks: Task[];
}) {
  const inProgressTaskCount = workspaceTasks.filter(
    (task) => task.status === 'backlog' || task.status === 'in_progress',
  ).length;
  const items: SurfaceSummaryItem[] = useMemo(
    () => [
      {
        accent: `${stats.active} active, ${activeExecutions.filter((execution) => execution.status === WorkflowExecutionStatus.PENDING).length} queued`,
        isLoading: isExecutionsLoading,
        label: 'Workflows Active',
        value: String(stats.active),
      },
      {
        accent: `${stats.completed} completed, ${stats.failed} failed`,
        isLoading: isTasksLoading,
        label: 'Tasks In Progress',
        value: String(inProgressTaskCount),
      },
      // Credits deliberately omitted: the topbar already carries the live
      // credit balance, and repeating it here read as a duplicate meter.
      {
        accent: `${reviewInbox.approvedCount} approved`,
        label: 'Pending Approvals',
        value: String(reviewInbox.pendingCount),
      },
    ],
    [
      activeExecutions,
      inProgressTaskCount,
      isExecutionsLoading,
      isTasksLoading,
      reviewInbox,
      stats,
    ],
  );

  // `inline`: this is the surface the agent conversation projects, so it is
  // held to the one-row / three-card contract by the component itself.
  return (
    <SurfaceSummaryStrip
      items={items}
      testId="dashboard-stats-strip"
      variant="inline"
    />
  );
}

function formatTaskEventLabel(task: Task): string {
  const latestEvent = task.eventStream?.at(-1);
  if (!latestEvent) {
    return task.status.replaceAll('_', ' ');
  }

  return latestEvent.type.replaceAll('_', ' ');
}

export function DashboardRecentActivity({
  isLoading = false,
  workspaceTasks,
}: {
  isLoading?: boolean;
  workspaceTasks: Task[];
}) {
  const { href } = useOrgUrl();
  const sortedTasks = useMemo(
    () =>
      workspaceTasks
        .toSorted(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
        )
        .slice(0, 8),
    [workspaceTasks],
  );

  return (
    <WorkspaceSurface
      aria-busy={isLoading}
      title="Recent Activity"
      density="compact"
      className="h-full"
      data-testid="dashboard-recent-activity"
      actions={
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-auto px-0 text-2xs font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={href(APP_ROUTES.WORKSPACE.INBOX_UNREAD)}>
            View All &rarr;
          </Link>
        </Button>
      }
    >
      {isLoading && sortedTasks.length === 0 ? (
        <div className="py-2">
          <WorkspaceTaskRowsSkeleton rows={4} />
        </div>
      ) : sortedTasks.length > 0 ? (
        <Table>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTasks.map((task) => {
              const latestEvent = task.eventStream?.at(-1);
              const message =
                typeof latestEvent?.payload?.summary === 'string'
                  ? latestEvent.payload.summary
                  : typeof latestEvent?.payload?.message === 'string'
                    ? latestEvent.payload.message
                    : task.progress?.message || task.request;

              return (
                <TableRow key={task.id}>
                  <TableCell className="w-px whitespace-nowrap pr-2 align-top pt-2.5">
                    <Badge status={task.status} size={ComponentSize.SM}>
                      {task.status.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-0 w-full">
                    <div className="truncate text-xs text-foreground">
                      {task.title}
                      {' — '}
                      <span className="text-foreground/50">
                        {formatTaskEventLabel(task)}
                      </span>
                    </div>
                    {message ? (
                      <div className="truncate text-2xs text-foreground/45">
                        {message}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="w-px whitespace-nowrap text-right text-2xs text-foreground/35">
                    {formatOptionalRelativeTime(
                      task.updatedAt ?? task.createdAt,
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="py-6 text-center text-xs text-foreground/45">
          No activity yet.
        </div>
      )}
    </WorkspaceSurface>
  );
}

export function DashboardRecentTasks({
  isLoading = false,
  workspaceTasks,
}: {
  isLoading?: boolean;
  workspaceTasks: Task[];
}) {
  const { href } = useOrgUrl();
  const sortedTasks = useMemo(
    () =>
      workspaceTasks
        .toSorted(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
        )
        .slice(0, 8),
    [workspaceTasks],
  );

  return (
    <WorkspaceSurface
      aria-busy={isLoading}
      title="Recent Tasks"
      density="compact"
      className="h-full"
      data-testid="dashboard-recent-tasks"
      actions={
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-auto px-0 text-2xs font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={href(APP_ROUTES.WORKSPACE.INBOX_UNREAD)}>
            View All &rarr;
          </Link>
        </Button>
      }
    >
      {isLoading && sortedTasks.length === 0 ? (
        <div className="py-2">
          <WorkspaceTaskRowsSkeleton rows={4} />
        </div>
      ) : sortedTasks.length > 0 ? (
        <Table>
          <TableHeader className="sr-only">
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell className="w-px whitespace-nowrap pr-2 align-top pt-2.5">
                  <Badge status={task.status} size={ComponentSize.SM}>
                    {task.status.replaceAll('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-0 w-full">
                  <div className="truncate text-xs text-foreground">
                    {task.title}
                  </div>
                  <div className="truncate text-2xs text-foreground/45">
                    {task.status.replaceAll('_', ' ')} &middot;{' '}
                    {formatOptionalRelativeTime(
                      task.updatedAt ?? task.createdAt,
                    )}
                  </div>
                </TableCell>
                <TableCell className="w-px whitespace-nowrap text-right text-2xs text-foreground/35 align-top pt-2.5">
                  {formatOptionalRelativeTime(task.updatedAt ?? task.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="py-6 text-center text-xs text-foreground/45">
          No recent tasks.
        </div>
      )}
    </WorkspaceSurface>
  );
}

const FIRST_RUN_STEPS = [
  'Describe what you want in the conversation below — a post, a campaign, a research pass.',
  'The agent plans it, runs it, and drops the output in your inbox for review.',
  'Approved work shows up here as runs, tasks, and trends.',
];

function WorkspaceDashboardFirstRun({ trendsHref }: { trendsHref: string }) {
  return (
    <section
      className="gen-shell-empty-state mx-auto w-full max-w-2xl p-8"
      data-testid="workspace-dashboard-first-run"
    >
      <h2 className="text-sm font-medium text-foreground">
        Nothing running yet
      </h2>
      <ol className="mt-4 space-y-2.5">
        {FIRST_RUN_STEPS.map((step, index) => (
          <li
            key={step}
            className="flex gap-3 text-xs leading-5 text-muted-foreground"
          >
            <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-2xs font-medium text-foreground/55">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-6">
        <Button asChild variant={ButtonVariant.SECONDARY} size={ButtonSize.XS}>
          <Link href={trendsHref}>Browse trends for an idea</Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * True once the brand has anything at all to show. Exported because the overview
 * page has to hide its task queue and sidebar on exactly the same condition —
 * two definitions would let the first-run block render with empty bands stacked
 * underneath it, which is the state it exists to replace.
 */
export function hasWorkspaceOverviewSignal({
  activeExecutions,
  executions,
  isExecutionsLoading = false,
  isTasksLoading = false,
  isTrendsLoading = false,
  reviewInbox,
  trendItems = [],
  workspaceTasks,
}: Pick<
  DashboardProps,
  | 'activeExecutions'
  | 'executions'
  | 'isExecutionsLoading'
  | 'isTasksLoading'
  | 'isTrendsLoading'
  | 'reviewInbox'
  | 'trendItems'
  | 'workspaceTasks'
>): boolean {
  // Loading counts as signal: collapsing to the guided block mid-fetch would
  // flash the first-run copy at every returning operator.
  if (isExecutionsLoading || isTasksLoading || isTrendsLoading) {
    return true;
  }

  return (
    activeExecutions.length > 0 ||
    executions.length > 0 ||
    workspaceTasks.length > 0 ||
    reviewInbox.pendingCount > 0 ||
    reviewInbox.recentItems.length > 0 ||
    trendItems.length > 0
  );
}

export function WorkspaceDashboard({
  activeExecutions,
  executions,
  isExecutionsLoading = false,
  isTasksLoading = false,
  isTrendsLoading = false,
  reviewInbox,
  stats,
  trendsHref: providedTrendsHref,
  trendItems = [],
  workspaceTasks,
}: DashboardProps) {
  const { href } = useOrgUrl();
  const scopedTrendsHref =
    providedTrendsHref ?? href(APP_ROUTES.DISCOVERY.OVERVIEW);
  // A brand with nothing in it used to render six empty bands stacked on top of
  // each other. Collapse the whole thing into one guided block instead.
  if (
    !hasWorkspaceOverviewSignal({
      activeExecutions,
      executions,
      isExecutionsLoading,
      isTasksLoading,
      isTrendsLoading,
      reviewInbox,
      trendItems,
      workspaceTasks,
    })
  ) {
    return <WorkspaceDashboardFirstRun trendsHref={scopedTrendsHref} />;
  }

  // Overview lives inside the conversation canvas, so it stays a centered,
  // hard-capped 3/6/9 card grid. The dense back-office chart grid now lives in
  // the operations module (`automation/runs/RunChartsGrid`), not here.
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <DashboardStatsStrip
        activeExecutions={activeExecutions}
        isExecutionsLoading={isExecutionsLoading}
        isTasksLoading={isTasksLoading}
        reviewInbox={reviewInbox}
        stats={stats}
        workspaceTasks={workspaceTasks}
      />

      <DashboardAgentCards
        activeExecutions={activeExecutions}
        executions={executions}
        isLoading={isExecutionsLoading}
      />

      <DashboardGrid cols={3}>
        <DashboardRecentActivity
          isLoading={isTasksLoading}
          workspaceTasks={workspaceTasks}
        />
        <DashboardRecentTasks
          isLoading={isTasksLoading}
          workspaceTasks={workspaceTasks}
        />
        <OverviewTrendsPanel
          trends={trendItems}
          isLoading={isTrendsLoading}
          viewAllHref={scopedTrendsHref}
        />
      </DashboardGrid>
    </div>
  );
}
