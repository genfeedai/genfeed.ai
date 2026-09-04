'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  formatPlatformLabel,
  normalizeReviewDecision,
  PageScope,
  ReviewDecision,
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
import { BatchesService } from '@services/batch/batches.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { ListRowsSkeleton } from '@ui/lists/list-row/ListRowsSkeleton';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ArrowRight, RefreshCw, TriangleAlert } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';
import {
  getActivityBadge,
  getCredentialBadge,
  needsAttentionCredential,
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

const CREDENTIAL_ROW_LIMIT = 6;
const ACTIVITY_ROW_LIMIT = 5;
const RECENT_EXECUTION_LIMIT = 3;
const NEEDS_YOU_LIMIT = 8;
const UPCOMING_SCHEDULE_DAYS = 7;

function ErrorLine({
  description,
  onRetry,
}: {
  description: string;
  onRetry: () => Promise<void>;
}) {
  const translate = useTranslations('common');

  return (
    <div
      className="flex flex-wrap items-center gap-3 border-l-2 border-destructive py-1 pl-3 text-sm text-foreground/70"
      role="alert"
    >
      <TriangleAlert
        aria-hidden="true"
        className="size-4 shrink-0 text-destructive"
      />
      <span className="min-w-0 flex-1">{description}</span>
      <Button
        onClick={() => {
          void onRetry();
        }}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
        {translate('actions.retry')}
      </Button>
    </div>
  );
}

function EmptyLine({
  actionHref,
  actionLabel,
  description,
}: {
  actionHref?: string;
  actionLabel?: string;
  description: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm text-foreground/55">
      <span>{description}</span>
      {actionHref && actionLabel ? (
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
          <Link href={actionHref}>
            {actionLabel}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      ) : null}
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

function isAwaitingReview(item: ReviewInboxItem): boolean {
  return normalizeReviewDecision(item.reviewDecision) === ReviewDecision.UNSET;
}

type NeedsYouItem =
  | { credential: ICredential; key: string; type: 'credential' }
  | { execution: IWorkflowExecution; key: string; type: 'failed' }
  | { item: ReviewInboxItem; key: string; type: 'review' };

function buildNeedsYouItems({
  credentials,
  failedExecutions,
  reviewInbox,
}: {
  credentials: ICredential[];
  failedExecutions: IWorkflowExecution[];
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
}): { items: NeedsYouItem[]; overflow: number } {
  const reviewItems: NeedsYouItem[] = reviewInbox.recentItems
    .filter(isAwaitingReview)
    .map((item) => ({
      item,
      key: `review-${item.id}`,
      type: 'review',
    }));
  const failedItems: NeedsYouItem[] = failedExecutions.map((execution) => ({
    execution,
    key: `failed-${execution.id}`,
    type: 'failed',
  }));
  const credentialItems: NeedsYouItem[] = credentials
    .filter(needsAttentionCredential)
    .map((credential) => ({
      credential,
      key: `credential-${credential.id}`,
      type: 'credential',
    }));
  const allItems = [...reviewItems, ...failedItems, ...credentialItems];
  const items = allItems.slice(0, NEEDS_YOU_LIMIT);

  return { items, overflow: allItems.length - items.length };
}

function getExecutionTimestamp(execution: IWorkflowExecution): string {
  return (
    execution.updatedAt ??
    execution.completedAt ??
    execution.startedAt ??
    execution.createdAt
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

function formatScheduleDayLabel(date: Date, index: number): string {
  if (index === 0) {
    return 'today';
  }

  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function NeedsYouSurface({
  brandSlug,
  credentials,
  failedExecutions,
  isError,
  isLoading,
  onApprove,
  onRetry,
  orgSlug,
  reviewInbox,
}: {
  brandSlug?: string;
  credentials: ICredential[];
  failedExecutions: IWorkflowExecution[];
  isError: boolean;
  isLoading: boolean;
  onApprove: (item: ReviewInboxItem) => Promise<void>;
  onRetry: () => Promise<void>;
  orgSlug: string;
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
}) {
  const translate = useTranslations('common');
  const [approvingItemId, setApprovingItemId] = useState<string | null>(null);
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const reviewHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.REVIEW)
    : brandSetupHref;
  const publishingHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.OVERVIEW)
    : brandSetupHref;
  const credentialsHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.SETTINGS.PUBLISHING)
    : brandSetupHref;
  const { items: needsYouItems, overflow } = buildNeedsYouItems({
    credentials,
    failedExecutions,
    reviewInbox,
  });

  const handleApprove = async (item: ReviewInboxItem) => {
    setApprovingItemId(item.id);
    try {
      await onApprove(item);
    } finally {
      setApprovingItemId(null);
    }
  };

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
      data-testid="operational-home-needs-you"
      density="compact"
      eyebrow="Needs you"
      title="Attention queue"
    >
      {isLoading ? (
        <ListRowsSkeleton rows={3} />
      ) : isError ? (
        <ErrorLine
          description="Approval state is temporarily unavailable. Publishing and credential checks remain available."
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyLine
          actionHref={brandSetupHref}
          actionLabel="Set up a brand"
          description="Add a brand before opening a brand-scoped review queue."
        />
      ) : needsYouItems.length === 0 ? (
        <EmptyLine description={translate('home.approvals.empty')} />
      ) : (
        <div>
          {needsYouItems.map((needsYouItem) => {
            if (needsYouItem.type === 'review') {
              const { item } = needsYouItem;
              const isApproving = approvingItemId === item.id;

              return (
                <ListRow
                  data-testid="operational-home-needs-you-row"
                  density="compact"
                  key={needsYouItem.key}
                  leading={
                    item.mediaUrl ? (
                      <span className="relative block size-10 overflow-hidden rounded-md bg-background-secondary shadow-border">
                        <Image
                          alt=""
                          className="object-cover"
                          fill
                          sizes="40px"
                          src={item.mediaUrl}
                        />
                      </span>
                    ) : (
                      <span className="inline-flex size-10 items-center justify-center rounded-md border border-dashed border-border text-2xs text-muted-foreground">
                        —
                      </span>
                    )
                  }
                  meta={
                    <span className="flex flex-wrap items-center gap-2">
                      {item.platform ? (
                        <PlatformBadge
                          platform={item.platform}
                          size={ComponentSize.SM}
                        />
                      ) : null}
                      <span>{item.format}</span>
                      <Badge variant="info">
                        {translate('home.approvals.readyToReview')}
                      </Badge>
                    </span>
                  }
                  title={item.summary}
                  trailing={
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        disabled={isApproving}
                        onClick={() => {
                          void handleApprove(item);
                        }}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                      >
                        {isApproving ? 'Approving…' : 'Approve'}
                      </Button>
                      <Button
                        asChild
                        size={ButtonSize.SM}
                        variant={ButtonVariant.GHOST}
                      >
                        <Link href={reviewItemHref(reviewHref, item)}>
                          {translate('home.approvals.openItem')}
                        </Link>
                      </Button>
                    </div>
                  }
                />
              );
            }

            if (needsYouItem.type === 'failed') {
              const { execution } = needsYouItem;

              return (
                <ListRow
                  data-testid="operational-home-needs-you-row"
                  density="compact"
                  description="Workflow execution failed."
                  key={needsYouItem.key}
                  meta={
                    <ClientFormattedDate
                      fallback="Time unavailable"
                      format="relative"
                      value={getExecutionTimestamp(execution)}
                    />
                  }
                  title={execution.workflow?.label ?? execution.workflowId}
                  trailing={
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.GHOST}
                    >
                      <Link href={publishingHref}>
                        {translate('home.approvals.openItem')}
                      </Link>
                    </Button>
                  }
                />
              );
            }

            const { credential } = needsYouItem;
            const badge = getCredentialBadge(credential);

            return (
              <ListRow
                data-testid="operational-home-needs-you-row"
                density="compact"
                key={needsYouItem.key}
                leading={
                  <PlatformBadge
                    platform={credential.platform}
                    showLabel={false}
                  />
                }
                meta={<Badge variant={badge.variant}>{badge.label}</Badge>}
                title={getCredentialLabel(credential)}
                trailing={
                  <Button
                    asChild
                    size={ButtonSize.SM}
                    variant={ButtonVariant.GHOST}
                  >
                    <Link href={credentialsHref}>
                      {translate('home.credentials.reconnect')}
                    </Link>
                  </Button>
                }
              />
            );
          })}
          {overflow > 0 ? (
            <ListRow
              data-testid="operational-home-needs-you-overflow"
              density="compact"
              href={reviewHref}
              title={translate('home.approvals.overflow', { count: overflow })}
              trailing={
                <span className="flex items-center gap-1 text-sm text-foreground/55">
                  {translate('home.approvals.viewAll')}
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </span>
              }
            />
          ) : null}
        </div>
      )}
    </WorkspaceSurface>
  );
}

function UpcomingScheduleBlock({
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
    <div
      className="flex flex-col gap-3 border-t border-border pt-4"
      data-testid="operational-home-upcoming"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-bold uppercase tracking-[0.2em] text-foreground/35">
          {translate('home.schedule.title')}
        </p>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
          <Link href={calendarHref}>
            {translate('home.schedule.open')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </div>

      {!brandSlug ? (
        <p className="text-sm text-foreground/55">
          {translate('home.schedule.addBrand')}
        </p>
      ) : isError ? (
        <div
          className="flex flex-wrap items-center gap-3 border-l-2 border-destructive py-1 pl-3 text-sm text-foreground/70"
          role="alert"
        >
          <span className="min-w-0 flex-1">
            {translate('home.schedule.unavailable')}
          </span>
          <Button
            aria-label="Retry upcoming schedule"
            onClick={() => {
              void refresh();
            }}
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      ) : scheduleDays === null ? (
        <Skeleton className="w-2/3" height={12} variant="text" />
      ) : totalScheduled === 0 ? (
        <p className="text-sm text-foreground/55">
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
    </div>
  );
}

function PublishingSurface({
  activeExecutions,
  brandId,
  brandSlug,
  executions,
  isError,
  isLoading,
  onRetry,
  orgSlug,
}: {
  activeExecutions: IWorkflowExecution[];
  brandId?: string;
  brandSlug?: string;
  executions: IWorkflowExecution[];
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
    .slice(0, RECENT_EXECUTION_LIMIT);

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
      density="compact"
      eyebrow="Publishing state"
      title="Distribution operations"
    >
      {isLoading ? (
        <ListRowsSkeleton rows={3} />
      ) : isError ? (
        <ErrorLine
          description="Publishing state could not be loaded. Credential health and activity remain available."
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyLine
          actionHref={brandSetupHref}
          actionLabel="Set up a brand"
          description="Add a brand before opening brand-scoped publishing."
        />
      ) : recentExecutions.length === 0 ? (
        <EmptyLine description={translate('home.publishing.empty')} />
      ) : (
        <div>
          {recentExecutions.map((execution) => (
            <ListRow
              density="compact"
              key={execution.id}
              meta={
                <ClientFormattedDate
                  fallback="Time unavailable"
                  format="relative"
                  value={getExecutionTimestamp(execution)}
                />
              }
              title={execution.workflow?.label ?? execution.workflowId}
              trailing={
                <Badge
                  variant={
                    EXECUTION_STATUS_VARIANTS[execution.status] ?? 'info'
                  }
                >
                  {execution.status.toLowerCase()}
                </Badge>
              }
            />
          ))}
        </div>
      )}

      <UpcomingScheduleBlock
        brandId={brandId}
        brandSlug={brandSlug}
        orgSlug={orgSlug}
      />
    </WorkspaceSurface>
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
      density="compact"
      eyebrow="Credential health"
      title="Channel readiness"
    >
      {isLoading ? (
        <>
          <span className="sr-only" role="status">
            {translate('home.credentials.loading')}
          </span>
          <ListRowsSkeleton rows={3} />
        </>
      ) : isError ? (
        <ErrorLine
          description="Credential health is temporarily unavailable. Approval, publishing, and activity summaries remain available."
          onRetry={onRetry}
        />
      ) : credentials.length === 0 ? (
        <EmptyLine
          actionHref={settingsHref}
          actionLabel={brandSlug ? 'Connect an account' : 'Set up a brand'}
          description="No publishing credentials are connected yet."
        />
      ) : (
        <div>
          {credentials.slice(0, CREDENTIAL_ROW_LIMIT).map((credential) => {
            const badge = getCredentialBadge(credential);

            return (
              <ListRow
                density="compact"
                description={
                  formatPlatformLabel(credential.platform) ??
                  credential.platform
                }
                key={credential.id}
                title={getCredentialLabel(credential)}
                trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
              />
            );
          })}
        </div>
      )}
    </WorkspaceSurface>
  );
}

function ActivitySurface({ activityHref }: { activityHref: string }) {
  const translate = useTranslations('common');
  const activityMessageFormatter = useActivityMessageFormatter();
  const { filteredActivities, isError, isLoading, refresh } = useActivities({
    limit: ACTIVITY_ROW_LIMIT,
    scope: PageScope.ORGANIZATION,
  });
  const recentActivities = filteredActivities.slice(0, ACTIVITY_ROW_LIMIT);

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
      data-testid="operational-home-activity"
      density="compact"
      eyebrow="Recent activity"
      title="What changed"
    >
      {isLoading ? (
        <ListRowsSkeleton rows={4} />
      ) : isError ? (
        <ErrorLine
          description="Recent activity is temporarily unavailable. Approval, publishing, and credential summaries remain available."
          onRetry={refresh}
        />
      ) : recentActivities.length === 0 ? (
        <EmptyLine
          actionHref={activityHref}
          actionLabel="Open activity"
          description="No activity has been recorded for this organization yet."
        />
      ) : (
        <div>
          {recentActivities.map((activity: IActivity) => {
            const badge = getActivityBadge(activity);
            return (
              <ListRow
                data-testid="operational-home-activity-row"
                density="compact"
                key={activity.id}
                meta={
                  <ClientFormattedDate
                    fallback="Time unavailable"
                    format="relative"
                    value={activity.createdAt}
                  />
                }
                title={getActivityDescription(
                  activity,
                  activityMessageFormatter,
                )}
                trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
              />
            );
          })}
        </div>
      )}
    </WorkspaceSurface>
  );
}

function metricValue(isLoading: boolean, value: number): ReactNode {
  if (isLoading) {
    return (
      <Skeleton
        className="inline-block align-middle"
        height={12}
        variant="text"
        width={20}
      />
    );
  }

  return String(value);
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
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
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
  const failedExecutions = executions.filter(
    (execution) => execution.status === WorkflowExecutionStatus.FAILED,
  );
  const attentionCredentials = credentials.filter(needsAttentionCredential);
  const refreshOperationalState = useCallback(async () => {
    await Promise.all([refresh(), refreshExecutions()]);
  }, [refresh, refreshExecutions]);
  const handleApproveReviewItem = useCallback(
    async (item: ReviewInboxItem) => {
      try {
        const service = await getBatchesService();
        await service.itemAction(item.batchId, {
          action: 'approve',
          itemIds: [item.id],
        });
        await refresh();
      } catch (error) {
        logger.error('Approve review item failed', error);
        notifications.error('Approve');
      }
    },
    [getBatchesService, notifications, refresh],
  );
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
      className="flex flex-col gap-4"
      data-testid="operational-home-sections"
    >
      <MetricSummary
        data-testid="operational-home-metrics"
        items={[
          {
            label: 'ready to review',
            value: metricValue(isLoading, reviewInbox.readyCount),
          },
          {
            label: 'pending posts',
            value: metricValue(isLoading, analytics.pendingPosts ?? 0),
          },
          {
            label: 'active',
            value: metricValue(areExecutionsLoading, activeExecutions.length),
          },
          {
            label: 'failed today',
            value: metricValue(areExecutionsLoading, executionStats.failed),
          },
          {
            label: 'need attention',
            value: metricValue(credentialsLoading, attentionCredentials.length),
          },
        ]}
      />

      <NeedsYouSurface
        brandSlug={brandSlug}
        credentials={credentials}
        failedExecutions={failedExecutions}
        isError={isError}
        isLoading={isLoading || areExecutionsLoading}
        onApprove={handleApproveReviewItem}
        onRetry={refreshOperationalState}
        orgSlug={orgSlug}
        reviewInbox={reviewInbox}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PublishingSurface
          activeExecutions={activeExecutions}
          brandId={brandId}
          brandSlug={brandSlug}
          executions={completedExecutions}
          isError={isError}
          isLoading={isLoading || areExecutionsLoading}
          onRetry={refreshOperationalState}
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
      </div>

      <ActivitySurface activityHref={activityHref} />
    </div>
  );
}
