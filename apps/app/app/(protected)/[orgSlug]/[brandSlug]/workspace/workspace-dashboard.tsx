'use client';

import {
  AgentExecutionStatus,
  ButtonSize,
  ButtonVariant,
} from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import type { AgentRunStats, AgentRunTrendPoint } from '@genfeedai/types';
import { cn } from '@helpers/formatting/cn/cn.util';
import type { WorkspaceTask } from '@services/workspace/workspace-tasks.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineArrowRight, HiOutlineCpuChip } from 'react-icons/hi2';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
  reviewInbox: ReviewInboxSummary;
  runs: IAgentRun[];
  stats: AgentRunStats | null;
  workspaceTasks: WorkspaceTask[];
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

function formatStatusLabel(status: AgentExecutionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
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
    <div className="group relative flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06]">
            <HiOutlineCpuChip className="h-4 w-4 text-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {agentLabel}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  STATUS_DOT_CLASSES[run.status],
                )}
              />
              <span className="text-[11px] text-foreground/45">
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
            href={`/orchestration/runs/${run.id}`}
            aria-label={`Open ${run.label}`}
          >
            <HiOutlineArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="min-h-[60px] rounded border border-white/[0.06] bg-black/40 px-3 py-2">
        <p className="line-clamp-1 text-xs font-medium text-foreground/70">
          {run.label}
        </p>
        <p className="mt-1 line-clamp-2 text-[11px] font-mono text-foreground/40 leading-relaxed">
          {run.status === AgentExecutionStatus.RUNNING ||
          run.status === AgentExecutionStatus.PENDING
            ? (run.objective ?? run.strategy ?? 'Waiting for output...')
            : (run.summary ?? run.objective ?? 'Run completed')}
        </p>
      </div>
    </div>
  );
}

export function DashboardAgentCards({
  activeRuns,
  runs,
}: {
  activeRuns: IAgentRun[];
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

  if (displayRuns.length === 0) {
    return null;
  }

  return (
    <section data-testid="dashboard-agents">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
          Agents
        </h2>
        {(activeRuns.length > 3 || runs.length > 3) && (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
          >
            <Link href="/orchestration/runs">View All</Link>
          </Button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {displayRuns.map((run) => (
          <AgentRunCard key={run.id} run={run} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats Strip                                                        */
/* ------------------------------------------------------------------ */

interface StatItem {
  accent?: string;
  label: string;
  value: string;
}

export function DashboardStatsStrip({
  activeRuns,
  reviewInbox,
  stats,
  workspaceTasks,
}: {
  activeRuns: IAgentRun[];
  reviewInbox: ReviewInboxSummary;
  stats: AgentRunStats | null;
  workspaceTasks: WorkspaceTask[];
}) {
  const inProgressTaskCount = workspaceTasks.filter(
    (task) => task.status === 'triaged' || task.status === 'in_progress',
  ).length;
  const items: StatItem[] = useMemo(
    () => [
      {
        accent: `${stats?.activeRuns ?? activeRuns.length} running, ${activeRuns.filter((r) => r.status === AgentExecutionStatus.PENDING).length} queued`,
        label: 'Agents Active',
        value: String(stats?.activeRuns ?? activeRuns.length),
      },
      {
        accent: `${stats?.completedToday ?? 0} completed, ${stats?.failedToday ?? 0} failed`,
        label: 'Tasks In Progress',
        value: String(inProgressTaskCount),
      },
      {
        accent: 'current period',
        label: 'Credits Used',
        value: `${(stats?.totalCreditsToday ?? 0).toFixed(2)}`,
      },
      {
        accent: `${reviewInbox.approvedCount} approved`,
        label: 'Pending Approvals',
        value: String(reviewInbox.pendingCount),
      },
    ],
    [activeRuns, inProgressTaskCount, reviewInbox, stats],
  );

  return (
    <section data-testid="dashboard-stats-strip">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Card
            key={item.label}
            className="min-h-[100px] shadow-none"
            bodyClassName="p-4"
          >
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                {item.label}
              </p>
              <div className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                {item.value}
              </div>
            </div>
            {item.accent ? (
              <p className="mt-1 text-xs text-foreground/45">{item.accent}</p>
            ) : null}
          </Card>
        ))}
      </div>
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
  purple: '#a78bfa',
  rose: '#fb7185',
};

interface MiniChartCardProps {
  children: React.ReactNode;
  subtitle: string;
  title: string;
}

function MiniChartCard({ children, subtitle, title }: MiniChartCardProps) {
  return (
    <Card className="shadow-none" bodyClassName="p-4">
      <div className="mb-3 space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[11px] text-foreground/35">{subtitle}</p>
      </div>
      <div className="h-[140px]">{children}</div>
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
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
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
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
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
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
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
            background: '#1a1a1a',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '12px',
          }}
        />
        <Bar
          dataKey="credits"
          fill={CHART_COLORS.purple}
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChartPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-foreground/30">
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

  return (
    <section data-testid="dashboard-charts">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Recent Activity & Recent Tasks                                     */
/* ------------------------------------------------------------------ */

function getTaskStatusClass(task: WorkspaceTask): string {
  if (task.status === 'failed') return 'bg-rose-400';
  if (task.status === 'needs_review' || task.reviewState === 'pending_approval')
    return 'bg-amber-400';
  if (task.status === 'completed') return 'bg-emerald-400';
  return 'bg-sky-400 animate-pulse';
}

function formatTaskEventLabel(task: WorkspaceTask): string {
  const latestEvent = task.eventStream.at(-1);
  if (!latestEvent) {
    return task.status.replaceAll('_', ' ');
  }

  return latestEvent.type.replaceAll('_', ' ');
}

function ActivityRow({ task }: { task: WorkspaceTask }) {
  const latestEvent = task.eventStream.at(-1);
  const message =
    typeof latestEvent?.payload?.summary === 'string'
      ? latestEvent.payload.summary
      : typeof latestEvent?.payload?.message === 'string'
        ? latestEvent.payload.message
        : task.progress?.message || task.request;

  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={cn(
            'mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full',
            getTaskStatusClass(task),
          )}
        />
        <div className="min-w-0">
          <p className="text-sm text-foreground">
            <span className="font-medium">{task.title}</span>{' '}
            <span className="text-foreground/50">
              {formatTaskEventLabel(task)}
            </span>
          </p>
          <p className="line-clamp-2 text-xs text-foreground/45">{message}</p>
        </div>
      </div>
      <span className="flex-shrink-0 text-xs text-foreground/35">
        {formatRelativeTime(
          task.updatedAt ?? task.createdAt ?? new Date().toISOString(),
        )}
      </span>
    </div>
  );
}

export function DashboardRecentActivity({
  workspaceTasks,
}: {
  workspaceTasks: WorkspaceTask[];
}) {
  const sortedTasks = useMemo(
    () =>
      [...workspaceTasks]
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
        )
        .slice(0, 8),
    [workspaceTasks],
  );

  return (
    <Card
      label="Recent Activity"
      headerAction={
        <Button asChild variant={ButtonVariant.SECONDARY} size={ButtonSize.XS}>
          <Link href="/workspace/activity">View All</Link>
        </Button>
      }
      bodyClassName="p-5 sm:p-6"
    >
      {sortedTasks.length > 0 ? (
        <div className="divide-y divide-white/[0.06]">
          {sortedTasks.map((task) => (
            <ActivityRow key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground/45">
          Activity will appear here once workspace tasks start running.
        </p>
      )}
    </Card>
  );
}

function TaskRow({ task }: { task: WorkspaceTask }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium',
            task.status === 'failed'
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
              : task.status === 'needs_review'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                : task.status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : 'bg-sky-500/10 text-sky-300 border-sky-500/20',
          )}
        >
          {task.status.replaceAll('_', ' ')}
        </span>
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-medium text-foreground">
            {task.title}
          </p>
          <p className="text-xs text-foreground/40">
            {task.progress?.percent ?? 0}% &middot;{' '}
            {formatRelativeTime(
              task.updatedAt ?? task.createdAt ?? new Date().toISOString(),
            )}
          </p>
        </div>
      </div>
      <Button asChild variant={ButtonVariant.GHOST} size={ButtonSize.XS}>
        <Link
          href={`/workspace/activity?taskId=${task.id}`}
          aria-label={`Open ${task.title}`}
        >
          <HiOutlineArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export function DashboardRecentTasks({
  workspaceTasks,
}: {
  workspaceTasks: WorkspaceTask[];
}) {
  const sortedTasks = useMemo(
    () =>
      [...workspaceTasks]
        .sort(
          (a, b) =>
            new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() -
            new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
        )
        .slice(0, 8),
    [workspaceTasks],
  );

  return (
    <Card
      label="Recent Tasks"
      headerAction={
        <Button asChild variant={ButtonVariant.SECONDARY} size={ButtonSize.XS}>
          <Link href="/workspace/inbox/unread">View All</Link>
        </Button>
      }
      bodyClassName="p-5 sm:p-6"
    >
      {sortedTasks.length > 0 ? (
        <div className="divide-y divide-white/[0.06]">
          {sortedTasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-foreground/45">
          Recent tasks will appear here once work begins.
        </p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard Layout                                              */
/* ------------------------------------------------------------------ */

export function WorkspaceDashboard({
  activeRuns,
  reviewInbox,
  runs,
  stats,
  workspaceTasks,
}: DashboardProps) {
  return (
    <div className="space-y-8">
      <DashboardAgentCards activeRuns={activeRuns} runs={runs} />

      <DashboardStatsStrip
        activeRuns={activeRuns}
        reviewInbox={reviewInbox}
        stats={stats}
        workspaceTasks={workspaceTasks}
      />

      <DashboardChartsGrid runs={runs} stats={stats} />

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardRecentActivity workspaceTasks={workspaceTasks} />
        <DashboardRecentTasks workspaceTasks={workspaceTasks} />
      </div>
    </div>
  );
}
