'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  PageScope,
  TargetExecutionState,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type {
  IActivity,
  ICredential,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import { getActivityDescription } from '@pages/activities/activities-list.utils';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';
import {
  getActivityBadge,
  getCredentialBadge,
  summarizeCredentialHealth,
  summarizeUpcomingSchedule,
  type UpcomingScheduleDay,
} from './operational-home.helpers';

interface OperationalHomeSectionsProps {
  brandSlug?: string;
  orgSlug: string;
}

type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

const EXECUTION_STATUS_VARIANTS: Record<
  WorkflowExecutionStatus,
  'destructive' | 'info' | 'secondary' | 'success' | 'warning'
> = {
  [WorkflowExecutionStatus.CANCELLED]: 'secondary',
  [WorkflowExecutionStatus.COMPLETED]: 'success',
  [WorkflowExecutionStatus.FAILED]: 'destructive',
  [WorkflowExecutionStatus.PENDING]: 'warning',
  [WorkflowExecutionStatus.RUNNING]: 'info',
};

function LoadingPanel({ label }: { label: string }) {
  return (
    <div
      aria-live="polite"
      className="rounded-card bg-background p-5 text-sm text-foreground/55 shadow-border"
      role="status"
    >
      {label}
    </div>
  );
}

function ErrorPanel({
  description,
  onRetry,
}: {
  description: string;
  onRetry: () => Promise<void>;
}) {
  const translate = useTranslations('common');

  return (
    <div
      className="rounded-card bg-destructive/5 p-5 shadow-border"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-destructive"
        />
        <div className="space-y-3">
          <p className="text-sm leading-6 text-foreground/70">{description}</p>
          <Button
            onClick={() => {
              void onRetry();
            }}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {translate('actions.retry')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({
  actionHref,
  actionLabel,
  description,
}: {
  actionHref: string;
  actionLabel: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-background p-5 shadow-border">
      <p className="text-sm leading-6 text-foreground/55">{description}</p>
      <Button asChild className="mt-4" variant={ButtonVariant.SECONDARY}>
        <Link href={actionHref}>
          {actionLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </div>
  );
}

function reviewItemHref(baseHref: string, item: ReviewInboxItem): string {
  const search = new URLSearchParams({
    batch: item.batchId,
    item: item.id,
  });
  return `${baseHref}?${search.toString()}`;
}

function ApprovalsSurface({
  brandSlug,
  isError,
  isLoading,
  onRetry,
  orgSlug,
  reviewInbox,
}: {
  brandSlug?: string;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<void>;
  orgSlug: string;
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
}) {
  const translate = useTranslations('common');
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const reviewHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.REVIEW)
    : brandSetupHref;

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={reviewHref}>
            {translate('home.approvals.open')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      }
      className="h-full"
      data-testid="operational-home-approvals"
      description="Items waiting for a human publishing decision."
      eyebrow="Approvals"
      title="Review queue"
    >
      {isLoading ? (
        <LoadingPanel label="Loading approval state..." />
      ) : isError ? (
        <ErrorPanel
          description="Approval state is temporarily unavailable. Publishing and credential checks remain available."
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyPanel
          actionHref={brandSetupHref}
          actionLabel="Set up a brand"
          description="Add a brand before opening a brand-scoped review queue."
        />
      ) : (
        <>
          <MetricSummary
            items={[
              { label: 'ready', value: String(reviewInbox.readyCount) },
              {
                label: 'generating',
                value: String(reviewInbox.pendingCount),
              },
            ]}
          />

          <div className="space-y-2">
            {reviewInbox.recentItems.length === 0 ? (
              <p className="rounded-card bg-background p-4 text-sm text-foreground/55 shadow-border">
                {translate('home.approvals.empty')}
              </p>
            ) : (
              reviewInbox.recentItems.slice(0, 3).map((item) => (
                <Button
                  className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 text-sm shadow-border transition hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  asChild
                  key={item.id}
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <Link href={reviewItemHref(reviewHref, item)}>
                    <span className="min-w-0">
                      <span className="line-clamp-1 font-medium text-foreground">
                        {item.summary}
                      </span>
                      <span className="mt-1 block text-xs text-foreground/45">
                        {item.format}
                        {item.platform ? ` · ${item.platform}` : ''}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-foreground/45"
                    />
                  </Link>
                </Button>
              ))
            )}
          </div>
        </>
      )}
    </WorkspaceSurface>
  );
}

function getExecutionTimestamp(execution: IWorkflowExecution): string {
  return (
    execution.updatedAt ??
    execution.completedAt ??
    execution.startedAt ??
    execution.createdAt
  );
}

function PublishingSurface({
  activeExecutions,
  analyticsPendingPosts,
  brandSlug,
  failedToday,
  isError,
  isLoading,
  onRetry,
  orgSlug,
  executions,
}: {
  activeExecutions: IWorkflowExecution[];
  analyticsPendingPosts: number;
  brandSlug?: string;
  failedToday: number;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<void>;
  orgSlug: string;
  executions: IWorkflowExecution[];
}) {
  const translate = useTranslations('common');
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const postsHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.OVERVIEW)
    : brandSetupHref;
  const recentExecutions = [...activeExecutions, ...executions]
    .filter(
      (execution, index, allExecutions) =>
        allExecutions.findIndex(
          (candidate) => candidate.id === execution.id,
        ) === index,
    )
    .toSorted(
      (left, right) =>
        new Date(getExecutionTimestamp(right)).getTime() -
        new Date(getExecutionTimestamp(left)).getTime(),
    )
    .slice(0, 3);

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={postsHref}>
            {translate('home.publishing.open')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      }
      className="h-full"
      data-testid="operational-home-publishing"
      description="Draft and execution state across the current workspace."
      eyebrow="Publishing state"
      title="Distribution operations"
    >
      {isLoading ? (
        <LoadingPanel label="Loading publishing state..." />
      ) : isError ? (
        <ErrorPanel
          description="Publishing state could not be loaded. Credential health and activity remain available."
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyPanel
          actionHref={brandSetupHref}
          actionLabel="Set up a brand"
          description="Add a brand before opening brand-scoped publishing."
        />
      ) : (
        <>
          <MetricSummary
            items={[
              { label: 'active', value: String(activeExecutions.length) },
              {
                label: 'pending posts',
                value: String(analyticsPendingPosts),
              },
              { label: 'failed today', value: String(failedToday) },
            ]}
          />

          <div className="space-y-2">
            {recentExecutions.length === 0 ? (
              <p className="rounded-card bg-background p-4 text-sm text-foreground/55 shadow-border">
                {translate('home.publishing.empty')}
              </p>
            ) : (
              recentExecutions.map((execution) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 shadow-border"
                  key={execution.id}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">
                      {execution.workflow?.label ?? execution.workflowId}
                    </p>
                    <ClientFormattedDate
                      className="mt-1 block text-xs text-foreground/45"
                      fallback="Time unavailable"
                      format="relative"
                      value={getExecutionTimestamp(execution)}
                    />
                  </div>
                  <Badge
                    variant={
                      EXECUTION_STATUS_VARIANTS[execution.status] ?? 'info'
                    }
                  >
                    {execution.status.toLowerCase()}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </WorkspaceSurface>
  );
}

const UPCOMING_SCHEDULE_DAYS = 7;

function formatScheduleDayLabel(date: Date, index: number): string {
  if (index === 0) {
    return 'today';
  }

  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function UpcomingScheduleSurface({
  brandId,
  brandSlug,
  orgSlug,
}: {
  brandId?: string;
  brandSlug?: string;
  orgSlug: string;
}) {
  const translate = useTranslations('common');
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const [scheduleDays, setScheduleDays] = useState<
    UpcomingScheduleDay[] | null
  >(null);
  const [isError, setIsError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshToken((current) => current + 1);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken intentionally re-runs the load after a manual retry
  useEffect(() => {
    if (!brandSlug) {
      return;
    }

    const controller = new AbortController();

    const loadSchedule = async () => {
      try {
        const service = await getReleaseGroupsService();

        const windowStart = new Date();
        windowStart.setHours(0, 0, 0, 0);
        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowEnd.getDate() + UPCOMING_SCHEDULE_DAYS);

        // Same scheduler read model the publish calendar queries — the window
        // filter narrows releases, the target filter narrows to live sends.
        const releases = await service.findAll(
          {
            ...(brandId ? { brandId } : {}),
            endDate: windowEnd.toISOString(),
            executionState: [TargetExecutionState.SCHEDULED],
            startDate: windowStart.toISOString(),
          },
          controller.signal,
        );

        if (controller.signal.aborted) {
          return;
        }

        setScheduleDays(
          summarizeUpcomingSchedule(
            releases,
            windowStart,
            UPCOMING_SCHEDULE_DAYS,
          ),
        );
        setIsError(false);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load the upcoming schedule', error);
        setIsError(true);
      }
    };

    void loadSchedule();

    return () => controller.abort();
  }, [brandId, brandSlug, getReleaseGroupsService, refreshToken]);

  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const calendarHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.CALENDAR)
    : brandSetupHref;
  const totalScheduled =
    scheduleDays?.reduce((total, day) => total + day.count, 0) ?? 0;

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={calendarHref}>
            {translate('home.schedule.open')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      }
      className="h-full lg:col-span-2"
      data-testid="operational-home-upcoming"
      description="Scheduled channel sends over the coming week."
      eyebrow="Upcoming schedule"
      title="Next 7 days"
    >
      {!brandSlug ? (
        <EmptyPanel
          actionHref={brandSetupHref}
          actionLabel="Set up a brand"
          description="Add a brand before scheduling posts to the calendar."
        />
      ) : isError ? (
        <ErrorPanel
          description="The upcoming schedule is temporarily unavailable. Approval, publishing, and credential summaries remain available."
          onRetry={refresh}
        />
      ) : scheduleDays === null ? (
        <LoadingPanel label="Loading upcoming schedule..." />
      ) : totalScheduled === 0 ? (
        <p className="rounded-card bg-background p-4 text-sm text-foreground/55 shadow-border">
          {translate('home.schedule.empty')}
        </p>
      ) : (
        <MetricSummary
          data-testid="upcoming-schedule-summary"
          items={[
            { label: 'scheduled', value: String(totalScheduled) },
            ...scheduleDays.map((day, index) => ({
              label: formatScheduleDayLabel(day.date, index),
              value: String(day.count),
            })),
          ]}
        />
      )}
    </WorkspaceSurface>
  );
}

function getCredentialLabel(credential: ICredential): string {
  const handle = credential.externalHandle?.replace(/^@/, '');
  return (
    credential.label ??
    credential.externalName ??
    (handle ? `@${handle}` : credential.platform)
  );
}

function CredentialHealthSurface({
  brandSlug,
  credentials,
  isError,
  isLoading,
  onRetry,
  orgSlug,
}: {
  brandSlug?: string;
  credentials: ICredential[];
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<void>;
  orgSlug: string;
}) {
  const translate = useTranslations('common');
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const settingsHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.PUBLISHING)
    : brandSetupHref;
  const summary = summarizeCredentialHealth(credentials);

  return (
    <WorkspaceSurface
      actions={
        <>
          <Button
            aria-label="Refresh credential health"
            onClick={() => {
              void onRetry();
            }}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <RefreshCw aria-hidden="true" className="size-4" />
          </Button>
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={settingsHref}>
              {translate('home.credentials.manage')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </>
      }
      className="h-full"
      data-testid="operational-home-credentials"
      description="Connected channel availability and publishing risk."
      eyebrow="Credential health"
      title="Channel readiness"
    >
      {isLoading ? (
        <LoadingPanel label="Loading credential health..." />
      ) : isError ? (
        <ErrorPanel
          description="Credential health is temporarily unavailable. Approval, publishing, and activity summaries remain available."
          onRetry={onRetry}
        />
      ) : (
        <>
          <MetricSummary
            data-testid="credential-health-summary"
            items={[
              { label: 'accounts', value: String(summary.total) },
              {
                label: 'need attention',
                value: String(summary.attention),
              },
              { label: 'healthy', value: String(summary.healthy) },
              ...(summary.unknown > 0
                ? [
                    {
                      label: 'unknown',
                      value: String(summary.unknown),
                    },
                  ]
                : []),
            ]}
          />

          <div className="space-y-2">
            {credentials.length === 0 ? (
              <EmptyPanel
                actionHref={settingsHref}
                actionLabel={
                  brandSlug ? 'Connect an account' : 'Set up a brand'
                }
                description="No publishing credentials are connected yet."
              />
            ) : (
              credentials.slice(0, 4).map((credential) => {
                const badge = getCredentialBadge(credential);

                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 shadow-border"
                    key={credential.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {getCredentialLabel(credential)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-foreground/45">
                        {credential.platform}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </WorkspaceSurface>
  );
}

function ActivitySurface({ activityHref }: { activityHref: string }) {
  const translate = useTranslations('common');
  const activityMessageFormatter = useActivityMessageFormatter();
  const { filteredActivities, isError, isLoading, refresh } = useActivities({
    limit: 5,
    scope: PageScope.ORGANIZATION,
  });
  const recentActivities = filteredActivities.slice(0, 5);

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={activityHref}>
            {translate('home.activity.open')}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      }
      className="h-full"
      data-testid="operational-home-activity"
      description="Organization-scoped actions and system events."
      eyebrow="Recent activity"
      title="What changed"
    >
      {isLoading ? (
        <LoadingPanel label="Loading recent activity..." />
      ) : isError ? (
        <ErrorPanel
          description="Recent activity is temporarily unavailable. Approval, publishing, and credential summaries remain available."
          onRetry={refresh}
        />
      ) : recentActivities.length === 0 ? (
        <EmptyPanel
          actionHref={activityHref}
          actionLabel="Open activity"
          description="No activity has been recorded for this organization yet."
        />
      ) : (
        <div className="space-y-2">
          {recentActivities.map((activity: IActivity) => {
            const badge = getActivityBadge(activity);
            return (
              <div
                className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 shadow-border"
                data-testid="operational-home-activity-row"
                key={activity.id}
              >
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">
                    {getActivityDescription(activity, activityMessageFormatter)}
                  </p>
                  <ClientFormattedDate
                    className="mt-1 block text-xs text-foreground/45"
                    fallback="Time unavailable"
                    format="relative"
                    value={activity.createdAt}
                  />
                </div>
                <Badge className="shrink-0" variant={badge.variant}>
                  {badge.label}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceSurface>
  );
}

export default function OperationalHomeSections({
  brandSlug,
  orgSlug,
}: OperationalHomeSectionsProps) {
  const {
    brandId,
    credentials,
    credentialsError,
    credentialsLoading,
    refreshBrands,
  } = useBrand();
  const { analytics, isError, isLoading, refresh, reviewInbox } =
    useOverviewBootstrap();
  const {
    executions,
    isLoading: areExecutionsLoading,
    refresh: refreshExecutions,
    stats: executionStats,
  } = useWorkflowExecutions({ limit: 20, sort: '-createdAt' });
  const activeExecutions = executions.filter(
    (execution) =>
      execution.status === WorkflowExecutionStatus.PENDING ||
      execution.status === WorkflowExecutionStatus.RUNNING,
  );
  const completedExecutions = executions.filter(
    (execution) =>
      execution.status !== WorkflowExecutionStatus.PENDING &&
      execution.status !== WorkflowExecutionStatus.RUNNING,
  );
  const refreshOperationalState = useCallback(async () => {
    await Promise.all([refresh(), refreshExecutions()]);
  }, [refresh, refreshExecutions]);
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  // Workspace Activity is the operator surface for this feed (same list as
  // /overview/activities, registered under the workspace switcher).
  const activityHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.WORKSPACE.ACTIVITY)
    : brandSetupHref;

  return (
    <div
      className="grid gap-4 lg:grid-cols-2"
      data-testid="operational-home-sections"
    >
      <ApprovalsSurface
        brandSlug={brandSlug}
        isError={isError}
        isLoading={isLoading}
        onRetry={refresh}
        orgSlug={orgSlug}
        reviewInbox={reviewInbox}
      />
      <PublishingSurface
        activeExecutions={activeExecutions}
        analyticsPendingPosts={analytics.pendingPosts ?? 0}
        brandSlug={brandSlug}
        failedToday={executionStats.failed}
        isError={isError}
        isLoading={isLoading || areExecutionsLoading}
        onRetry={refreshOperationalState}
        orgSlug={orgSlug}
        executions={completedExecutions}
      />
      <UpcomingScheduleSurface
        brandId={brandId}
        brandSlug={brandSlug}
        orgSlug={orgSlug}
      />
      <CredentialHealthSurface
        brandSlug={brandSlug}
        credentials={credentials}
        isError={Boolean(credentialsError)}
        isLoading={credentialsLoading}
        onRetry={refreshBrands}
        orgSlug={orgSlug}
      />
      <ActivitySurface activityHref={activityHref} />
    </div>
  );
}
