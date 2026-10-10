import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
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
  createPublishingApprovalsRoute,
} from '@genfeedai/contracts/constants';
import type {
  IActivity,
  ICredential,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import { getWorkflowExecutionLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import { getPublishingReleaseHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { useWorkflowExecutions } from '@hooks/data/workflow-executions/use-workflow-executions';
import {
  getActivityDescription,
  getActivityDestinationPath,
  getActivityDetailText,
  getActivityLifecycleText,
} from '@pages/activities/activities-list.utils';
import ActivityThumbnailCell from '@pages/activities/components/ActivityThumbnailCell';
import AccountCell from '@pages/brands/components/integrations/AccountCell';
import PublishingPostHoverPreview from '@pages/posts/library/publishing-post-hover-preview';
import {
  badgeVariantForTone,
  releaseStatusBadge,
} from '@pages/posts/shared/release-status.helpers';
import type {
  NeedsYouItem,
  OperationalHomeSectionsProps,
  PublishingSurfaceProps,
  ReviewInboxItem,
} from '@props/home/operational-home-sections.props';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import { BatchesService } from '@services/batch/batches.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import MetricCard, { MetricSummary } from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { ListRow } from '@ui/lists/list-row/ListRow';
import {
  credentialToSocialConnection,
  isVisibleCredentialRow,
} from '@ui/modals/brands/brand/ModalBrand.types';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Check, RefreshCw, TriangleAlert } from 'lucide-react';
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
import { useHomePublications } from './use-home-publications';

const CREDENTIAL_ROW_LIMIT = 5;
const ACTIVITY_ROW_LIMIT = 5;
const NEEDS_YOU_LIMIT = 5;
const WORKFLOW_UNAVAILABLE_LABEL = 'Workflow unavailable';
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
      className="mx-4 my-3 flex flex-wrap items-center gap-3 border-l-2 border-destructive py-1 pl-3 text-sm text-foreground/70 sm:mx-5"
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

function EmptyLine({ description }: { description: ReactNode }) {
  return (
    <div
      className="px-4 py-3 text-sm text-muted-foreground sm:px-5"
      data-testid="workspace-empty-state"
    >
      {description}
    </div>
  );
}

function SurfaceTitleLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="transition-colors hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

function isAwaitingReview(item: ReviewInboxItem): boolean {
  return normalizeReviewDecision(item.reviewDecision) === ReviewDecision.UNSET;
}

function buildNeedsYouItems({
  credentials,
  failedExecutions,
  reviewInbox,
}: {
  credentials: ICredential[];
  failedExecutions: IWorkflowExecution[];
  reviewInbox: OverviewBootstrapPayload['reviewInbox'];
}): NeedsYouItem[] {
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

  return items;
}

function getExecutionTimestamp(execution: IWorkflowExecution): string {
  return (
    execution.updatedAt ??
    execution.completedAt ??
    execution.startedAt ??
    execution.createdAt
  );
}

function formatScheduleDayLabel(date: Date, index: number): string {
  if (index === 0) {
    return 'today';
  }

  return date.toLocaleDateString('en-US', { weekday: 'short' });
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
  const reviewItemHref = (item: ReviewInboxItem) =>
    brandSlug
      ? createBrandAppRoute(
          orgSlug,
          brandSlug,
          createPublishingApprovalsRoute({
            batch: item.batchId,
            item: item.id,
          }),
        )
      : brandSetupHref;
  const runHref = (executionId: string) =>
    brandSlug
      ? createBrandAppRoute(
          orgSlug,
          brandSlug,
          `${APP_ROUTES.AUTOMATION.RUNS}/${encodeURIComponent(executionId)}`,
        )
      : brandSetupHref;
  const credentialsHref = brandSlug
    ? createBrandAppRoute(
        orgSlug,
        brandSlug,
        APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
      )
    : brandSetupHref;
  const needsYouItems = buildNeedsYouItems({
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
      data-testid="operational-home-needs-you"
      isLoading={isLoading}
      density="compact"
      flush
      title={
        <SurfaceTitleLink href={reviewHref}>
          {translate('home.approvals.title')}
        </SurfaceTitleLink>
      }
    >
      {isError ? (
        <ErrorLine
          description={translate('home.approvals.unavailable')}
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyLine description={translate('home.approvals.addBrand')} />
      ) : needsYouItems.length === 0 ? (
        <EmptyLine description={translate('home.approvals.empty')} />
      ) : (
        <div>
          {needsYouItems.map((needsYouItem) => {
            if (needsYouItem.type === 'review') {
              const { item } = needsYouItem;
              const isApproving = approvingItemId === item.id;

              return (
                <PublishingPostHoverPreview
                  className="border-b border-border last:border-b-0"
                  key={needsYouItem.key}
                  postId={item.postId}
                  target={{
                    id: item.id,
                    caption: item.summary,
                    platform: item.platform ?? 'social',
                    media: item.mediaUrl
                      ? [
                          {
                            id: item.id,
                            kind:
                              item.format === 'video' ||
                              item.format === 'short_video'
                                ? 'video'
                                : 'image',
                            url: item.mediaUrl,
                          },
                        ]
                      : [],
                  }}
                >
                  <ListRow
                    className="border-b-0"
                    data-testid="operational-home-needs-you-row"
                    density="compact"
                    leading={
                      item.mediaUrl ? (
                        <span className="relative block size-10 overflow-hidden rounded-md bg-background-secondary shadow-border">
                          {item.format === 'video' ||
                          item.format === 'short_video' ? (
                            <VideoPlayer
                              className="size-full"
                              src={`${item.mediaUrl.split('#')[0]}#t=0.001`}
                              config={{
                                muted: true,
                                controls: false,
                                loop: false,
                                preload: 'metadata',
                                playsInline: true,
                              }}
                              mediaProps={{ tabIndex: -1 }}
                              mediaClassName="object-cover"
                            />
                          ) : (
                            <Image
                              alt=""
                              className="object-cover"
                              fill
                              sizes="40px"
                              src={item.mediaUrl}
                            />
                          )}
                        </span>
                      ) : null
                    }
                    meta={
                      <span className="flex flex-wrap items-center gap-2">
                        {item.platform ? (
                          <PlatformBadge
                            platform={item.platform}
                            showLabel={false}
                            size={ComponentSize.SM}
                          />
                        ) : null}
                        <span>{item.format}</span>
                        <Badge variant="info">
                          {translate('home.approvals.readyToReview')}
                        </Badge>
                      </span>
                    }
                    title={
                      <Link
                        aria-label={`Open ${item.summary}`}
                        className="block truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        href={reviewItemHref(item)}
                      >
                        {item.summary}
                      </Link>
                    }
                    trailing={
                      <Button
                        ariaLabel={translate('home.approvals.approve')}
                        className="size-8"
                        disabled={isApproving}
                        isLoading={isApproving}
                        onClick={() => {
                          void handleApprove(item);
                        }}
                        size={ButtonSize.ICON}
                        tooltip={translate('home.approvals.approvePost')}
                        variant={ButtonVariant.GHOST}
                        withWrapper={false}
                      >
                        <Check aria-hidden="true" className="size-4" />
                      </Button>
                    }
                  />
                </PublishingPostHoverPreview>
              );
            }

            if (needsYouItem.type === 'failed') {
              const { execution } = needsYouItem;

              return (
                <ListRow
                  data-testid="operational-home-needs-you-row"
                  density="compact"
                  description={
                    execution.error?.trim() ||
                    translate('home.approvals.workflowFailed')
                  }
                  key={needsYouItem.key}
                  meta={
                    <ClientFormattedDate
                      fallback="Time unavailable"
                      format="relative"
                      value={getExecutionTimestamp(execution)}
                    />
                  }
                  title={getWorkflowExecutionLabel(
                    execution,
                    WORKFLOW_UNAVAILABLE_LABEL,
                  )}
                  trailing={
                    <Button
                      asChild
                      size={ButtonSize.SM}
                      variant={ButtonVariant.GHOST}
                    >
                      <Link href={runHref(execution.id)}>
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
                meta={<Badge variant={badge.variant}>{badge.label}</Badge>}
                title={
                  <AccountCell
                    connection={credentialToSocialConnection(credential)}
                  />
                }
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

  if (
    !brandSlug ||
    (!isError && scheduleDays !== null && totalScheduled === 0)
  ) {
    return null;
  }

  return (
    <div
      className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:px-5"
      data-testid="operational-home-upcoming"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {translate('home.schedule.title')}
        </p>
        <Button asChild size={ButtonSize.SM} variant={ButtonVariant.GHOST}>
          <Link href={calendarHref}>
            {translate('home.schedule.open')}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </Button>
      </div>

      {isError ? (
        <div
          className="flex flex-wrap items-center gap-3 border-l-2 border-destructive py-1 pl-3 text-sm text-foreground/70"
          role="alert"
        >
          <span className="min-w-0 flex-1">
            {translate('home.schedule.unavailable')}
          </span>
          <Button
            aria-label={translate('home.schedule.retry')}
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
      ) : scheduleDays === null ? null : (
        <MetricSummary
          data-testid="upcoming-schedule-summary"
          items={[
            {
              label: translate('home.schedule.scheduled'),
              value: String(totalScheduled),
            },
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
  brandId,
  brandSlug,
  publications,
  isError,
  isLoading,
  onRetry,
  orgSlug,
}: PublishingSurfaceProps) {
  const translate = useTranslations('common');
  const translatePosts = useTranslations('pages.posts.list');
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const postsHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.PUBLISHING.OVERVIEW)
    : brandSetupHref;

  return (
    <WorkspaceSurface
      className="h-full"
      data-testid="operational-home-publishing"
      isLoading={isLoading}
      density="compact"
      flush
      title={
        <SurfaceTitleLink href={postsHref}>
          {translate('home.publishing.title')}
        </SurfaceTitleLink>
      }
    >
      {isError ? (
        <ErrorLine
          description={translate('home.publishing.unavailable')}
          onRetry={onRetry}
        />
      ) : !brandSlug ? (
        <EmptyLine description={translate('home.publishing.addBrand')} />
      ) : (
        <>
          {publications.length === 0 ? (
            <EmptyLine description={translate('home.publishing.empty')} />
          ) : (
            <div>
              {publications.map((publication) => {
                const badge = releaseStatusBadge(publication);
                return (
                  <ListRow
                    density="compact"
                    key={publication.id}
                    href={createBrandAppRoute(
                      orgSlug,
                      brandSlug,
                      getPublishingReleaseHref(publication.id),
                    )}
                    meta={
                      <ClientFormattedDate
                        fallback="Time unavailable"
                        format="relative"
                        value={publication.updatedAt ?? publication.createdAt}
                      />
                    }
                    title={publication.title || translatePosts('untitled')}
                    trailing={
                      <Badge variant={badgeVariantForTone(badge.tone)}>
                        {badge.label}
                      </Badge>
                    }
                  />
                );
              })}
            </div>
          )}
          {publications.length > 0 && (
            <UpcomingScheduleBlock
              brandId={brandId}
              brandSlug={brandSlug}
              orgSlug={orgSlug}
            />
          )}
        </>
      )}
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
  const translateSocial = useTranslations('pages.brandSocialMedia');
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const settingsHref = brandSlug
    ? createBrandAppRoute(
        orgSlug,
        brandSlug,
        APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
      )
    : brandSetupHref;

  return (
    <WorkspaceSurface
      className="h-full"
      data-testid="operational-home-credentials"
      isLoading={isLoading}
      loadingLabel={translate('home.credentials.loading')}
      density="compact"
      flush
      title={
        <SurfaceTitleLink href={settingsHref}>
          {translate('home.credentials.title')}
        </SurfaceTitleLink>
      }
    >
      {isError ? (
        <ErrorLine
          description={translate('home.credentials.unavailable')}
          onRetry={onRetry}
        />
      ) : credentials.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-4 py-3 sm:px-5">
          <p className="text-sm text-muted-foreground">
            {translate('home.credentials.empty')}
          </p>
          <Button asChild size={ButtonSize.SM} variant={ButtonVariant.DEFAULT}>
            <Link href={settingsHref}>
              {brandSlug
                ? translateSocial('connectAccount')
                : translate('home.credentials.addBrand')}
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div>
          {credentials.slice(0, CREDENTIAL_ROW_LIMIT).map((credential) => {
            const badge = getCredentialBadge(credential);

            return (
              <ListRow
                density="compact"
                key={credential.id}
                title={
                  <AccountCell
                    connection={credentialToSocialConnection(credential)}
                  />
                }
                trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
              />
            );
          })}
        </div>
      )}
    </WorkspaceSurface>
  );
}

function ActivitySurface({
  activityHref,
  orgSlug,
  brandSlug,
}: {
  activityHref: string;
  orgSlug: string;
  brandSlug?: string;
}) {
  const translate = useTranslations('common');
  const activityMessageFormatter = useActivityMessageFormatter();
  const { filteredActivities, isError, isLoading, refresh } = useActivities({
    limit: ACTIVITY_ROW_LIMIT,
    scope: PageScope.ORGANIZATION,
  });
  const recentActivities = filteredActivities.slice(0, ACTIVITY_ROW_LIMIT);

  return (
    <WorkspaceSurface
      data-testid="operational-home-activity"
      isLoading={isLoading}
      density="compact"
      flush
      title={
        <SurfaceTitleLink href={activityHref}>
          {translate('home.activity.title')}
        </SurfaceTitleLink>
      }
    >
      {isError ? (
        <ErrorLine
          description={translate('home.activity.unavailable')}
          onRetry={refresh}
        />
      ) : recentActivities.length === 0 ? (
        <EmptyLine description={translate('home.activity.empty')} />
      ) : (
        <div>
          {recentActivities.map((activity: IActivity) => {
            const badge = getActivityBadge(activity);
            const assetPath = getActivityDestinationPath(activity);
            const assetHref = assetPath
              ? brandSlug
                ? createBrandAppRoute(orgSlug, brandSlug, assetPath)
                : createOrganizationAppRoute(orgSlug, assetPath)
              : undefined;
            const detail = [
              getActivityLifecycleText(activity),
              getActivityDetailText(activity),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <ListRow
                data-testid="operational-home-activity-row"
                density="compact"
                key={activity.id}
                leading={
                  assetHref ? (
                    <Link
                      href={assetHref}
                      aria-label={`Open ${getActivityDescription(activity, activityMessageFormatter)}`}
                    >
                      <ActivityThumbnailCell activity={activity} />
                    </Link>
                  ) : undefined
                }
                description={detail || undefined}
                meta={
                  <ClientFormattedDate
                    fallback="Time unavailable"
                    format="relative"
                    value={activity.createdAt}
                  />
                }
                title={
                  assetHref ? (
                    <Link href={assetHref}>
                      {getActivityDescription(
                        activity,
                        activityMessageFormatter,
                      )}
                    </Link>
                  ) : (
                    getActivityDescription(activity, activityMessageFormatter)
                  )
                }
                trailing={<Badge variant={badge.variant}>{badge.label}</Badge>}
              />
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
  const translate = useTranslations('common');
  const {
    brandId,
    organizationId,
    credentials,
    credentialsError,
    credentialsLoading,
    refreshBrands,
  } = useBrand();
  const { analytics, isError, isLoading, refresh, reviewInbox } =
    useOverviewBootstrap();
  const {
    executions,
    isLoading: isWorkflowExecutionsLoading,
    refresh: refreshExecutions,
    stats: executionStats,
  } = useWorkflowExecutions(
    { brandId, limit: 20, sort: '-createdAt' },
    { organizationId, enabled: Boolean(brandId) },
  );
  const areExecutionsLoading = Boolean(brandId) && isWorkflowExecutionsLoading;
  const publishing = useHomePublications(organizationId, brandId);
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getBatchesService = useAuthedService((token: string) =>
    BatchesService.getInstance(token),
  );
  const failedExecutions = executions.filter(
    (execution) => execution.status === WorkflowExecutionStatus.FAILED,
  );
  // Abandoned OAuth attempts (no identity, never connected) are not accounts;
  // the integrations page hides them and so must every home surface.
  const accountCredentials = useMemo(
    () => credentials.filter(isVisibleCredentialRow),
    [credentials],
  );
  const attentionCredentials = accountCredentials.filter(
    needsAttentionCredential,
  );
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
        notifications.error(translate('home.approvals.approveError'));
      }
    },
    [getBatchesService, notifications, refresh, translate],
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
      <MetricCardGrid columns={5} data-testid="operational-home-metrics">
        <MetricCard
          isLoading={isLoading}
          label={translate('home.metrics.readyToReview')}
          size="sm"
          value={String(reviewInbox.readyCount)}
        />
        <MetricCard
          isLoading={isLoading}
          label={translate('home.metrics.pendingPosts')}
          size="sm"
          value={String(analytics.pendingPosts ?? 0)}
        />
        <MetricCard
          isLoading={areExecutionsLoading}
          label={translate('home.metrics.active')}
          size="sm"
          value={String(executionStats.active)}
        />
        <MetricCard
          isLoading={areExecutionsLoading}
          label={translate('home.metrics.failedToday')}
          size="sm"
          value={String(executionStats.failedToday)}
        />
        <MetricCard
          isLoading={credentialsLoading}
          label={translate('home.metrics.needAttention')}
          size="sm"
          value={String(attentionCredentials.length)}
        />
      </MetricCardGrid>

      <NeedsYouSurface
        brandSlug={brandSlug}
        credentials={accountCredentials}
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
          brandId={brandId}
          brandSlug={brandSlug}
          publications={publishing.publications}
          isError={publishing.isError}
          isLoading={publishing.isLoading}
          onRetry={publishing.refresh}
          orgSlug={orgSlug}
        />
        <CredentialHealthSurface
          brandSlug={brandSlug}
          credentials={accountCredentials}
          isError={Boolean(credentialsError)}
          isLoading={credentialsLoading}
          onRetry={refreshBrands}
          orgSlug={orgSlug}
        />
      </div>

      <ActivitySurface
        activityHref={activityHref}
        orgSlug={orgSlug}
        brandSlug={brandSlug}
      />
    </div>
  );
}
