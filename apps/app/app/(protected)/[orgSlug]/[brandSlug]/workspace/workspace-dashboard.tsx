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
import type { AgentRunStats, AgentRunTrendPoint } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { Task } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { OverviewTrendsPanel } from '@ui/overview/OverviewTrendsPanel';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineArrowRight, HiOutlineCpuChip } from 'react-icons/hi2';
import { WorkspaceTaskRowsSkeleton } from './workspace-task-loading';

const Bar = dynamic(() => import('recharts').then((module) => module.Bar), {
  ssr: false,
});
const BarChart = dynamic(
  () => import('recharts').then((module) => module.BarChart),
  { ssr: false },
);
const CartesianGrid = dynamic(
  () => import('recharts').then((module) => module.CartesianGrid),
  { ssr: false },
);
const ResponsiveContainer = dynamic(
  () => import('recharts').then((module) => module.ResponsiveContainer),
  { ssr: false },
);
const Tooltip = dynamic(
  () => import('recharts').then((module) => module.Tooltip),
  { ssr: false },
);
const XAxis = dynamic(() => import('recharts').then((module) => module.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((module) => module.YAxis), {
  ssr: false,
});

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

interface StatItem {
  accent?: string;
  isLoading?: boolean;
  label: string;
  value: string;
}

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
  const items: StatItem[] = useMemo(
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
      {
        accent: 'current period',
        isLoading: isRunsLoading,
        label: 'Credits Used',
        value: `${(stats?.totalCreditsToday ?? 0).toFixed(2)}`,
      },
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

  return (
    <section data-testid="dashboard-stats-strip">
      <DashboardGrid>
        {items.map((item) => (
          <Card key={item.label} bodyClassName="p-4">
            {item.isLoading ? (
              <Skeleton variant="text" height={32} className="w-16" />
            ) : (
              <div className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {item.value}
              </div>
            )}
            <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/55">
              {item.label}
            </p>
            {item.isLoading ? (
              <Skeleton variant="text" height={12} className="mt-2 w-28" />
            ) : item.accent ? (
              <p className="mt-1.5 text-[11px] text-foreground/45">
                {item.accent}
              </p>
            ) : null}
          </Card>
        ))}
      </DashboardGrid>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Mini Charts                                                        */
/* ------------------------------------------------------------------ */

const CHART_COLORS = {
  amber: '#fbbf24',
  blue: '#60a5fa',
  cyan: '#22d3ee',
  emerald: '#34d399',
  rose: '#fb7185',
};

interface MiniChartCardProps {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}

function MiniChartCard({ children, subtitle, title }: MiniChartCardProps) {
  return (
    <Card bodyClassName="p-4">
      <div className="mb-2 space-y-0.5">
        <h3 className="text-xs font-semibold text-foreground">{title}</h3>
        <p className="text-[10px] uppercase tracking-wider text-foreground/40">
          {subtitle}
        </p>
      </div>
      <div className="h-[120px]">{children}</div>
    </Card>
  );
}

function RunActivityChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => ({
        date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
        runs: point.totalRuns,
      })),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#111111',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="runs" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RunsByStatusChart({ runs }: { runs: IAgentRun[] }) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const run of runs) {
      const status = formatStatusLabel(run.status);
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [runs]);

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#111111',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '12px',
          }}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} fill={CHART_COLORS.cyan} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function SuccessRateChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => {
        const autoRoutedRate = Math.round(point.autoRoutedRate * 100);
        return {
          date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
          rate: autoRoutedRate > 100 ? 100 : autoRoutedRate,
        };
      }),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          contentStyle={{
            background: '#111111',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '12px',
          }}
          formatter={(value: unknown) => [`${String(value ?? 0)}%`, 'Rate']}
        />
        <Bar dataKey="rate" fill={CHART_COLORS.emerald} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CreditsByDayChart({ trends }: { trends: AgentRunTrendPoint[] }) {
  const data = useMemo(
    () =>
      trends.slice(-14).map((point) => ({
        credits: Number(point.totalCreditsUsed.toFixed(2)),
        date: point.bucket.split('T')[0]?.slice(5) ?? point.bucket,
      })),
    [trends],
  );

  if (data.length === 0) {
    return <EmptyChartPlaceholder />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ bottom: 0, left: -20, right: 0, top: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.04)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: '#111111',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            color: '#fff',
            fontSize: '12px',
          }}
        />
        <Bar
          dataKey="credits"
          fill={CHART_COLORS.amber}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChartPlaceholder() {
  return (
    <div className="gen-shell-empty-state flex h-full items-center justify-center rounded-[1rem] text-xs text-foreground/32">
      No data for this period
    </div>
  );
}

export function DashboardChartsGrid({
  runs,
  stats,
}: {
  runs: IAgentRun[];
  stats: AgentRunStats | null;
}) {
  const trends = stats?.trends ?? [];

  if (trends.length === 0 && runs.length === 0) {
    return null;
  }

  return (
    <section data-testid="dashboard-charts">
      <DashboardGrid>
        <MiniChartCard title="Run Activity" subtitle="Last 14 days">
          <RunActivityChart trends={trends} />
        </MiniChartCard>
        <MiniChartCard title="Runs by Status" subtitle="Last 14 days">
          <RunsByStatusChart runs={runs} />
        </MiniChartCard>
        <MiniChartCard title="Credits by Day" subtitle="Last 14 days">
          <CreditsByDayChart trends={trends} />
        </MiniChartCard>
        <MiniChartCard title="Success Rate" subtitle="Last 14 days">
          <SuccessRateChart trends={trends} />
        </MiniChartCard>
      </DashboardGrid>
    </section>
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
    <div aria-busy={isLoading}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Recent Activity
        </h2>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-auto px-0 text-[11px] font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={APP_ROUTES.WORKSPACE.INBOX_UNREAD}>View All &rarr;</Link>
        </Button>
      </div>
      <Card bodyClassName="p-0">
        {isLoading && sortedTasks.length === 0 ? (
          <div className="px-4 py-2">
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
          <div className="px-4 py-6 text-center text-xs text-foreground/45">
            No activity yet.
          </div>
        )}
      </Card>
    </div>
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
    <div aria-busy={isLoading}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Recent Tasks</h2>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="h-auto px-0 text-[11px] font-normal text-foreground/45 hover:bg-transparent"
        >
          <Link href={APP_ROUTES.WORKSPACE.INBOX_UNREAD}>View All &rarr;</Link>
        </Button>
      </div>
      <Card bodyClassName="p-0">
        {isLoading && sortedTasks.length === 0 ? (
          <div className="px-4 py-2">
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
                    {formatOptionalRelativeTime(
                      task.updatedAt ?? task.createdAt,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-foreground/45">
            No recent tasks.
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Layout                                              */
/* ------------------------------------------------------------------ */

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
  return (
    <div className="flex flex-col gap-4">
      <DashboardAgentCards
        activeRuns={activeRuns}
        isLoading={isRunsLoading}
        runs={runs}
      />

      <DashboardStatsStrip
        activeRuns={activeRuns}
        isRunsLoading={isRunsLoading}
        isTasksLoading={isTasksLoading}
        reviewInbox={reviewInbox}
        stats={stats}
        workspaceTasks={workspaceTasks}
      />

      <DashboardChartsGrid runs={runs} stats={stats} />

      <DashboardGrid cols={2}>
        <DashboardRecentActivity
          isLoading={isTasksLoading}
          workspaceTasks={workspaceTasks}
        />
        <DashboardRecentTasks
          isLoading={isTasksLoading}
          workspaceTasks={workspaceTasks}
        />
      </DashboardGrid>

      <OverviewTrendsPanel
        trends={trendItems}
        isLoading={isTrendsLoading}
        viewAllHref={trendsHref}
      />
    </div>
  );
}
