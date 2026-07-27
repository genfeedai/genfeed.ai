'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import {
  AgentExecutionStatus,
  ButtonSize,
  ButtonVariant,
  CardVariant,
} from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import type { TrendItem } from '@genfeedai/props/trends/trends-page.props';
import type { AgentRunStats } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { SurfaceSummaryItem } from '@props/ui/dashboard/surface-summary-strip.props';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
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
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineArrowRight, HiOutlineCpuChip } from 'react-icons/hi2';
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
  activeRuns: IAgentRun[];
  isRunsLoading?: boolean;
  isTasksLoading?: boolean;
  isTrendsLoading?: boolean;
  reviewInbox: ReviewInboxSummary;
  runs: IAgentRun[];
  stats: AgentRunStats | null;
  trendsHref?: string;
  trendItems?: TrendItem[];
  workspaceTasks: Task[];
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

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

function formatStatusLabel(status: AgentExecutionStatus): string {
  const normalized = status.toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const STATUS_DOT_CLASSES: Record<AgentExecutionStatus, string> = {
  [AgentExecutionStatus.RUNNING]: 'bg-emerald-400 animate-pulse',
  [AgentExecutionStatus.PENDING]: 'bg-amber-400 animate-pulse',
  [AgentExecutionStatus.COMPLETED]: 'bg-emerald-400',
  [AgentExecutionStatus.FAILED]: 'bg-rose-400',
  [AgentExecutionStatus.CANCELLED]: 'bg-zinc-400',
};

/* ------------------------------------------------------------------ */
/*  Agent Cards (Top section)                                          */
/* ------------------------------------------------------------------ */

function AgentRunCard({ run }: { run: IAgentRun }) {
  const statusLabel =
    run.status === AgentExecutionStatus.RUNNING
      ? 'Live now'
      : run.status === AgentExecutionStatus.PENDING
        ? 'Queued'
        : formatStatusLabel(run.status);

  const agentLabel =
    typeof run.metadata?.agentName === 'string'
      ? run.metadata.agentName
      : (run.label?.split(' ')?.[0] ?? 'Agent');

  return (
    <Card
      variant={CardVariant.DEFAULT}
      className="group"
      bodyClassName="gap-2 p-3"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded border border-border bg-muted">
            <HiOutlineCpuChip className="size-3.5 text-foreground/60" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              {agentLabel}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  STATUS_DOT_CLASSES[run.status],
                )}
              />
              <span className="text-[10px] uppercase tracking-wide text-foreground/45">
                {statusLabel}
              </span>
            </div>
          </div>
        </div>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Link
            href={`${APP_ROUTES.ORCHESTRATION.RUNS}/${run.id}`}
            aria-label={`Open ${run.label}`}
          >
            <HiOutlineArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="rounded border border-border bg-muted/50 px-2.5 py-2">
        <p className="line-clamp-1 text-[12px] font-medium text-foreground/75">
          {run.label}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[11px] font-mono text-foreground/45">
          {run.status === AgentExecutionStatus.RUNNING ||
          run.status === AgentExecutionStatus.PENDING
            ? (run.objective ?? run.strategy ?? 'Waiting for output...')
            : (run.summary ?? run.objective ?? 'Run completed')}
        </p>
      </div>
    </Card>
  );
}

export function DashboardAgentCards({
  activeRuns,
  isLoading = false,
  runs,
}: {
  activeRuns: IAgentRun[];
  isLoading?: boolean;
  runs: IAgentRun[];
}) {
  const displayRuns = useMemo(() => {
    const liveRuns = activeRuns.slice(0, 3);
    if (liveRuns.length >= 3) return liveRuns;

    const recentCompleted = runs
      .filter(
        (run) =>
          !activeRuns.some((active) => active.id === run.id) &&
          run.status !== AgentExecutionStatus.PENDING,
      )
      .slice(0, 3 - liveRuns.length);

    return [...liveRuns, ...recentCompleted];
  }, [activeRuns, runs]);

  if (displayRuns.length === 0 && !isLoading) {
    return null;
  }

  return (
    <section data-testid="dashboard-agents">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-foreground">
          Running Agents
        </h2>
        {(activeRuns.length > 3 || runs.length > 3) && (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
          >
            <Link href={APP_ROUTES.ORCHESTRATION.RUNS}>View All</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && displayRuns.length === 0
          ? [
              'agent-run-skeleton-1',
              'agent-run-skeleton-2',
              'agent-run-skeleton-3',
            ].map((key) => (
              <Card key={key} variant={CardVariant.DEFAULT} bodyClassName="p-3">
                <WorkspaceTaskRowsSkeleton rows={1} />
              </Card>
            ))
          : displayRuns.map((run) => <AgentRunCard key={run.id} run={run} />)}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats Strip                                                        */
/* ------------------------------------------------------------------ */

export function DashboardStatsStrip({
  activeRuns,
  isRunsLoading = false,
  isTasksLoading = false,
  reviewInbox,
  stats,
  workspaceTasks,
}: {
  activeRuns: IAgentRun[];
  isRunsLoading?: boolean;
  isTasksLoading?: boolean;
  reviewInbox: ReviewInboxSummary;
  stats: AgentRunStats | null;
  workspaceTasks: Task[];
}) {
  const inProgressTaskCount = workspaceTasks.filter(
    (task) => task.status === 'backlog' || task.status === 'in_progress',
  ).length;
  const items: SurfaceSummaryItem[] = useMemo(
    () => [
      {
        accent: `${stats?.activeRuns ?? activeRuns.length} running, ${activeRuns.filter((r) => r.status === AgentExecutionStatus.PENDING).length} queued`,
        isLoading: isRunsLoading,
        label: 'Agents Active',
        value: String(stats?.activeRuns ?? activeRuns.length),
      },
      {
        accent: `${stats?.completedToday ?? 0} completed, ${stats?.failedToday ?? 0} failed`,
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
      activeRuns,
      inProgressTaskCount,
      isRunsLoading,
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

/* ------------------------------------------------------------------ */
/*  Recent Activity & Recent Tasks                                     */
/* ------------------------------------------------------------------ */

function getTaskStatusClass(task: Task): string {
  if (task.status === 'failed') return 'bg-rose-400';
  if (task.status === 'in_review' || task.reviewState === 'pending_approval')
    return 'bg-amber-400';
  if (task.status === 'done') return 'bg-emerald-400';
  return 'bg-sky-400 animate-pulse';
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
          className="h-auto px-0 text-[11px] font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={APP_ROUTES.WORKSPACE.INBOX_UNREAD}>View All &rarr;</Link>
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
                    <span
                      aria-hidden="true"
                      className={cn(
                        'inline-block h-1.5 w-1.5 rounded-full',
                        getTaskStatusClass(task),
                      )}
                    />
                    <span className="sr-only">
                      {task.status.replaceAll('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-0 w-full">
                    <div className="truncate text-[12px] text-foreground">
                      {task.title}
                      {' — '}
                      <span className="text-foreground/50">
                        {formatTaskEventLabel(task)}
                      </span>
                    </div>
                    {message ? (
                      <div className="truncate text-[11px] text-foreground/45">
                        {message}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="w-px whitespace-nowrap text-right text-[10px] text-foreground/35">
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
          className="h-auto px-0 text-[11px] font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={APP_ROUTES.WORKSPACE.INBOX_UNREAD}>View All &rarr;</Link>
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
                  <span
                    className={cn(
                      'inline-flex items-center justify-center rounded border border-border px-2 py-0.5 text-[9px] font-medium uppercase',
                      task.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                        : task.status === 'in_review'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                          : task.status === 'done'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-sky-500/10 text-sky-300 border-sky-500/20',
                    )}
                  >
                    {task.status.replaceAll('_', ' ')}
                  </span>
                </TableCell>
                <TableCell className="max-w-0 w-full">
                  <div className="truncate text-[12px] text-foreground">
                    {task.title}
                  </div>
                  <div className="truncate text-[11px] text-foreground/45">
                    {task.status.replaceAll('_', ' ')} &middot;{' '}
                    {formatOptionalRelativeTime(
                      task.updatedAt ?? task.createdAt,
                    )}
                  </div>
                </TableCell>
                <TableCell className="w-px whitespace-nowrap text-right text-[10px] text-foreground/35 align-top pt-2.5">
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

/* ------------------------------------------------------------------ */
/*  Guided first run                                                   */
/* ------------------------------------------------------------------ */

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
            <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium text-foreground/55">
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

/* ------------------------------------------------------------------ */
/*  Main Dashboard Layout                                              */
/* ------------------------------------------------------------------ */

/**
 * True once the brand has anything at all to show. Exported because the overview
 * page has to hide its task queue and sidebar on exactly the same condition —
 * two definitions would let the first-run block render with empty bands stacked
 * underneath it, which is the state it exists to replace.
 */
export function hasWorkspaceOverviewSignal({
  activeRuns,
  isRunsLoading = false,
  isTasksLoading = false,
  isTrendsLoading = false,
  reviewInbox,
  runs,
  trendItems = [],
  workspaceTasks,
}: Pick<
  DashboardProps,
  | 'activeRuns'
  | 'isRunsLoading'
  | 'isTasksLoading'
  | 'isTrendsLoading'
  | 'reviewInbox'
  | 'runs'
  | 'trendItems'
  | 'workspaceTasks'
>): boolean {
  // Loading counts as signal: collapsing to the guided block mid-fetch would
  // flash the first-run copy at every returning operator.
  if (isRunsLoading || isTasksLoading || isTrendsLoading) {
    return true;
  }

  return (
    activeRuns.length > 0 ||
    runs.length > 0 ||
    workspaceTasks.length > 0 ||
    reviewInbox.pendingCount > 0 ||
    reviewInbox.recentItems.length > 0 ||
    trendItems.length > 0
  );
}

export function WorkspaceDashboard({
  activeRuns,
  isRunsLoading = false,
  isTasksLoading = false,
  isTrendsLoading = false,
  reviewInbox,
  runs,
  stats,
  trendsHref = APP_ROUTES.RESEARCH.DISCOVERY,
  trendItems = [],
  workspaceTasks,
}: DashboardProps) {
  // A brand with nothing in it used to render six empty bands stacked on top of
  // each other. Collapse the whole thing into one guided block instead.
  if (
    !hasWorkspaceOverviewSignal({
      activeRuns,
      isRunsLoading,
      isTasksLoading,
      isTrendsLoading,
      reviewInbox,
      runs,
      trendItems,
      workspaceTasks,
    })
  ) {
    return <WorkspaceDashboardFirstRun trendsHref={trendsHref} />;
  }

  // Overview lives inside the conversation canvas, so it stays a centered,
  // hard-capped 3/6/9 card grid. The dense back-office chart grid now lives in
  // the operations module (`orchestration/runs/RunChartsGrid`), not here.
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <DashboardStatsStrip
        activeRuns={activeRuns}
        isRunsLoading={isRunsLoading}
        isTasksLoading={isTasksLoading}
        reviewInbox={reviewInbox}
        stats={stats}
        workspaceTasks={workspaceTasks}
      />

      <DashboardAgentCards
        activeRuns={activeRuns}
        isLoading={isRunsLoading}
        runs={runs}
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
          viewAllHref={trendsHref}
        />
      </DashboardGrid>
    </div>
  );
}
