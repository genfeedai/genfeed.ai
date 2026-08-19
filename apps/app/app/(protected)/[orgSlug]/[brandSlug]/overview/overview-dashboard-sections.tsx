'use client';

import { AgentExecutionStatus, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun, SurfaceSummaryItem } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import type {
  PlatformTimeSeriesDataPoint,
  SocialPlatform,
} from '@props/analytics/charts.props';
import type { TableColumn } from '@props/ui/display/table.props';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
import AppTable from '@ui/display/table/Table';
import { OverviewTrendsPanel } from '@ui/overview/OverviewTrendsPanel';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Button } from '@ui/primitives/button';
import { ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo } from 'react';

export { OverviewTrendsPanel };

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

type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

const STATUS_TONE: Record<AgentExecutionStatus, string> = {
  [AgentExecutionStatus.CANCELLED]:
    'bg-muted text-muted-foreground border-border',
  [AgentExecutionStatus.COMPLETED]:
    'bg-success/15 text-success border-success/30',
  [AgentExecutionStatus.FAILED]:
    'bg-destructive/15 text-destructive border-destructive/40',
  [AgentExecutionStatus.PENDING]:
    'bg-warning/15 text-warning border-warning/30',
  [AgentExecutionStatus.RUNNING]: 'bg-info/15 text-info border-info/30',
};

function formatStatusLabel(status: AgentExecutionStatus | string): string {
  const normalized = String(status).toLowerCase().replaceAll('_', ' ');
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveStatusTone(status: AgentExecutionStatus | string): string {
  const key = String(status).toUpperCase() as AgentExecutionStatus;
  return STATUS_TONE[key] ?? STATUS_TONE[AgentExecutionStatus.PENDING];
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
  status: AgentExecutionStatus | string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-1 text-[11px] font-medium',
        resolveStatusTone(status),
      )}
    >
      {formatStatusLabel(status)}
    </span>
  );
}

export function OverviewTopStatStrip({
  items,
}: {
  items: SurfaceSummaryItem[];
}) {
  return (
    <SurfaceSummaryStrip
      density="comfortable"
      items={items}
      testId="overview-top-stats"
    />
  );
}

export function OverviewOperationsSection({
  runsHref = '/automate/runs',
  runs,
}: {
  runsHref?: string;
  runs: IAgentRun[];
}) {
  const displayRuns = useMemo(
    () =>
      runs
        .toSorted(
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
            <ArrowRight className="size-4" />
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
        <div className="h-full px-0 [&_table]:table-fixed [&_td]:align-top [&_thead]:static [&_thead]:bg-transparent [&_th]:h-10 [&_th]:bg-transparent [&_th]:px-5 [&_th]:text-foreground/45">
          <AppTable<IAgentRun>
            items={displayRuns}
            columns={columns}
            emptyState={
              <div className="flex items-center justify-center rounded-card bg-background p-8 text-sm text-foreground/55 shadow-border">
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
  analyticsHref = '/analytics',
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
            <ArrowRight className="size-4" />
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

      <div className="overflow-hidden rounded-card bg-background p-4 shadow-border">
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
  inboxHref = '/publish/review',
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
            <ArrowRight className="size-4" />
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
          <div className="rounded-card bg-background px-4 py-5 text-sm text-foreground/55 shadow-border">
            No items are waiting in the publishing inbox.
          </div>
        ) : (
          recentItems.map((item) => (
            <div
              key={item.id}
              className="rounded-card bg-background p-4 shadow-border"
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
                        ? `/publish/review?batch=${item.batchId}&item=${item.id}`
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
