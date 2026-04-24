'use client';

import { AgentExecutionStatus, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  PlatformTimeSeriesDataPoint,
  SocialPlatform,
} from '@props/analytics/charts.props';
import type { TableColumn } from '@props/ui/display/table.props';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';
import { HiOutlineArrowRight } from 'react-icons/hi2';

const PlatformTimeSeriesChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-time-series/platform-time-series-chart'
    ).then((mod) => mod.PlatformTimeSeriesChart),
  {
    loading: () => <div className="h-chart w-full animate-pulse bg-muted/60" />,
    ssr: false,
  },
);

interface OverviewTopStatItem {
  accent?: string;
  label: string;
  tone?: string;
  value: string;
}

type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

const STATUS_TONE: Record<AgentExecutionStatus, string> = {
  [AgentExecutionStatus.CANCELLED]:
    'bg-zinc-500/10 text-zinc-300 border-zinc-500/20',
  [AgentExecutionStatus.COMPLETED]:
    'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  [AgentExecutionStatus.FAILED]:
    'bg-rose-500/10 text-rose-300 border-rose-500/20',
  [AgentExecutionStatus.PENDING]:
    'bg-amber-500/10 text-amber-300 border-amber-500/20',
  [AgentExecutionStatus.RUNNING]:
    'bg-blue-500/10 text-blue-300 border-blue-500/20',
};

function formatStatusLabel(status: AgentExecutionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatRelativeTime(date: string): string {
  const delta = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(delta / 60000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function getRunTimestamp(run: IAgentRun): string {
  return run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt;
}

function getRunMetadataString(run: IAgentRun, key: string): string | undefined {
  const value = run.metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function getRunModelLabel(run: IAgentRun): string {
  const actualModel = getRunMetadataString(run, 'actualModel');
  const requestedModel = getRunMetadataString(run, 'requestedModel');

  if (actualModel && requestedModel && actualModel !== requestedModel) {
    return `${actualModel} via ${requestedModel}`;
  }

  return actualModel ?? requestedModel ?? 'Untracked';
}

export function OverviewStatusBadge({
  status,
}: {
  status: AgentExecutionStatus;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-1 text-[11px] font-medium',
        STATUS_TONE[status],
      )}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

export function OverviewTopStatStrip({
  items,
}: {
  items: OverviewTopStatItem[];
}) {
  return (
    <div
      data-testid="overview-top-stats"
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <Card
          key={item.label}
          className={cn(
            'ship-ui gen-shell-panel min-h-[136px] rounded-[1.25rem] border-white/[0.06] bg-background/88 shadow-[0_24px_64px_-44px_rgba(0,0,0,0.88)]',
            item.tone,
          )}
          bodyClassName="flex h-full flex-col justify-between gap-6 p-5"
        >
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/35">
              {item.label}
            </p>
            <div className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
              {item.value}
            </div>
          </div>
          {item.accent ? (
            <p className="text-sm leading-6 text-foreground/55">
              {item.accent}
            </p>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function OverviewOperationsSection({
  runsHref = '/orchestration/runs',
  runs,
}: {
  runsHref?: string;
  runs: IAgentRun[];
}) {
  const displayRuns = useMemo(
    () =>
      [...runs]
        .sort(
          (left, right) =>
            new Date(getRunTimestamp(right)).getTime() -
            new Date(getRunTimestamp(left)).getTime(),
        )
        .slice(0, 5),
    [runs],
  );

  const columns = useMemo<TableColumn<IAgentRun>[]>(
    () => [
      {
        className: 'min-w-0',
        header: 'Run',
        key: 'label',
        render: (run) => (
          <div className="min-w-0 max-w-[20rem] space-y-1">
            <div
              className="line-clamp-2 text-sm font-medium leading-5 text-foreground"
              title={run.label}
            >
              {run.label}
            </div>
            <div
              className="line-clamp-1 text-xs leading-5 text-foreground/45"
              title={run.strategy ?? run.objective ?? 'Manual agent run'}
            >
              {run.strategy ?? run.objective ?? 'Manual agent run'}
            </div>
          </div>
        ),
      },
      {
        className: 'w-[7rem] whitespace-nowrap',
        header: 'Status',
        key: 'status',
        render: (run) => <OverviewStatusBadge status={run.status} />,
      },
      {
        className: 'w-[6rem] whitespace-nowrap',
        header: 'Model',
        key: 'metadata',
        render: (run) => (
          <span
            className="block truncate text-xs text-foreground/70"
            title={getRunModelLabel(run)}
          >
            {getRunModelLabel(run)}
          </span>
        ),
      },
      {
        className: 'w-[6rem] whitespace-nowrap',
        header: 'Updated',
        key: 'updatedAt',
        render: (run) => (
          <span className="text-foreground/70">
            {formatRelativeTime(getRunTimestamp(run))}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <WorkspaceSurface
      eyebrow="Live Operations"
      title="Active And Recent Runs"
      tone="default"
      className="flex h-full flex-col gap-4"
      data-testid="overview-operations-surface"
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={runsHref}>
            <HiOutlineArrowRight className="h-4 w-4" />
            View All
          </Link>
        </Button>
      }
    >
      <div
        data-testid="overview-operations-panel"
        className="text-sm text-foreground/55"
      >
        Showing {displayRuns.length} of {runs.length} runs
      </div>

      <div data-testid="overview-runs-table" className="flex-1">
        <div className="h-full px-0 [&_table]:table-fixed [&_td]:align-top [&_thead]:static [&_thead]:bg-transparent [&_th]:h-10 [&_th]:bg-transparent [&_th]:px-5 [&_th]:text-white/24">
          <AppTable<IAgentRun>
            items={displayRuns}
            columns={columns}
            emptyState={
              <div className="ship-ui gen-shell-empty-state flex items-center justify-center rounded-[1rem] p-8 text-sm text-foreground/55">
                No runs match the current filters.
              </div>
            }
            getRowKey={(run) => run.id}
          />
        </div>
      </div>
    </WorkspaceSurface>
  );
}

export function OverviewPerformanceChartSection({
  analyticsHref = '/analytics/overview',
  data,
  isLoading = false,
  platforms,
}: {
  analyticsHref?: string;
  data: PlatformTimeSeriesDataPoint[];
  isLoading?: boolean;
  platforms: SocialPlatform[];
}) {
  return (
    <WorkspaceSurface
      eyebrow="Performance Trend"
      title="Platform Momentum Over Time"
      tone="default"
      className="flex h-full flex-col gap-4"
      data-testid="overview-performance-surface"
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={analyticsHref}>
            <HiOutlineArrowRight className="h-4 w-4" />
            View All
          </Link>
        </Button>
      }
    >
      <div
        data-testid="overview-performance-panel"
        className="text-sm text-foreground/55"
      >
        Last 14 days of synced analytics
      </div>

      <div className="ship-ui gen-shell-surface overflow-hidden rounded-[1rem] border-white/[0.06] bg-background/52 px-4 py-4">
        <PlatformTimeSeriesChart
          data={data}
          platforms={platforms}
          isLoading={isLoading}
          height={320}
        />
      </div>
    </WorkspaceSurface>
  );
}

function formatReviewItemLabel(item: ReviewInboxItem): string {
  const platform = item.platform ? ` on ${item.platform}` : '';
  return `${item.format}${platform}`;
}

export function OverviewPublishingInboxSection({
  inboxHref = '/posts/review',
  readyCount,
  recentItems,
}: {
  inboxHref?: string;
  readyCount: number;
  recentItems: ReviewInboxItem[];
}) {
  return (
    <WorkspaceSurface
      eyebrow="Publishing Todo"
      title="Publishing Inbox"
      tone="default"
      className="flex h-full flex-col gap-4"
      data-testid="overview-publishing-surface"
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={inboxHref}>
            <HiOutlineArrowRight className="h-4 w-4" />
            Open Queue
          </Link>
        </Button>
      }
    >
      <div className="text-sm text-foreground/55">
        {readyCount} items ready for human review
      </div>

      <div className="space-y-3">
        {recentItems.length === 0 ? (
          <div className="ship-ui gen-shell-empty-state rounded-[1rem] px-4 py-5 text-sm text-foreground/55">
            No items are waiting in the publishing inbox.
          </div>
        ) : (
          recentItems.map((item) => (
            <div
              key={item.id}
              className="ship-ui gen-shell-surface rounded-[1rem] border-white/[0.06] bg-background/52 px-4 py-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div
                    className="line-clamp-1 text-sm font-medium text-foreground"
                    title={item.summary}
                  >
                    {item.summary}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {formatReviewItemLabel(item)}
                  </div>
                </div>
                <Button asChild variant={ButtonVariant.SECONDARY}>
                  <Link
                    href={
                      item.postId
                        ? `/posts/review?batch=${item.batchId}&item=${item.id}`
                        : inboxHref
                    }
                  >
                    Review
                  </Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </WorkspaceSurface>
  );
}
