'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/constants';
import {
  AgentExecutionStatus,
  ButtonVariant,
  PageScope,
} from '@genfeedai/enums';
import type { IAgentRun, ICredential } from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import { getActivityDescription } from '@pages/activities/activities-list.utils';
import type { OverviewBootstrapPayload } from '@services/auth/auth.service';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  HiArrowPath,
  HiArrowRight,
  HiOutlineExclamationTriangle,
} from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  getActivityBadge,
  getCredentialBadge,
  summarizeCredentialHealth,
} from './operational-home.helpers';

interface OperationalHomeSectionsProps {
  brandSlug?: string;
  orgSlug: string;
}

interface MetricProps {
  label: string;
  value: string;
}

type ReviewInboxItem =
  OverviewBootstrapPayload['reviewInbox']['recentItems'][number];

const RUN_STATUS_VARIANTS: Record<
  AgentExecutionStatus,
  'destructive' | 'outline' | 'success' | 'warning'
> = {
  [AgentExecutionStatus.CANCELLED]: 'outline',
  [AgentExecutionStatus.COMPLETED]: 'success',
  [AgentExecutionStatus.FAILED]: 'destructive',
  [AgentExecutionStatus.PENDING]: 'warning',
  [AgentExecutionStatus.RUNNING]: 'warning',
};

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-card bg-background px-4 py-3 shadow-border">
      <dt className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
        {value}
      </dd>
    </div>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-3">{children}</dl>;
}

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
  return (
    <div
      className="rounded-card bg-destructive/5 p-5 shadow-border"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <HiOutlineExclamationTriangle
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
            <HiArrowPath aria-hidden="true" className="size-4" />
            Retry
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
          <HiArrowRight aria-hidden="true" className="size-4" />
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
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const reviewHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.POSTS.REVIEW)
    : brandSetupHref;

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={reviewHref}>
            Open queue
            <HiArrowRight aria-hidden="true" className="size-4" />
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
          <MetricGrid>
            <Metric
              label="Ready to review"
              value={String(reviewInbox.readyCount)}
            />
            <Metric
              label="Still generating"
              value={String(reviewInbox.pendingCount)}
            />
          </MetricGrid>

          <div className="space-y-2">
            {reviewInbox.recentItems.length === 0 ? (
              <p className="rounded-card bg-background p-4 text-sm text-foreground/55 shadow-border">
                Nothing is waiting for review.
              </p>
            ) : (
              reviewInbox.recentItems.slice(0, 3).map((item) => (
                <Button
                  className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 text-sm shadow-border transition hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    <HiArrowRight
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

function getRunTimestamp(run: IAgentRun): string {
  return run.updatedAt ?? run.completedAt ?? run.startedAt ?? run.createdAt;
}

function PublishingSurface({
  activeRuns,
  analyticsPendingPosts,
  brandSlug,
  failedToday,
  isError,
  isLoading,
  onRetry,
  orgSlug,
  runs,
}: {
  activeRuns: IAgentRun[];
  analyticsPendingPosts: number;
  brandSlug?: string;
  failedToday: number;
  isError: boolean;
  isLoading: boolean;
  onRetry: () => Promise<void>;
  orgSlug: string;
  runs: IAgentRun[];
}) {
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const postsHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.POSTS.ROOT)
    : brandSetupHref;
  const recentRuns = [...activeRuns, ...runs]
    .filter(
      (run, index, allRuns) =>
        allRuns.findIndex((candidate) => candidate.id === run.id) === index,
    )
    .toSorted(
      (left, right) =>
        new Date(getRunTimestamp(right)).getTime() -
        new Date(getRunTimestamp(left)).getTime(),
    )
    .slice(0, 3);

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={postsHref}>
            Open publishing
            <HiArrowRight aria-hidden="true" className="size-4" />
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
          <MetricGrid>
            <Metric label="Active runs" value={String(activeRuns.length)} />
            <Metric
              label="Pending posts"
              value={String(analyticsPendingPosts)}
            />
            <Metric label="Failed runs today" value={String(failedToday)} />
          </MetricGrid>

          <div className="space-y-2">
            {recentRuns.length === 0 ? (
              <p className="rounded-card bg-background p-4 text-sm text-foreground/55 shadow-border">
                No publishing runs yet. Drafts created through MCP will appear
                here.
              </p>
            ) : (
              recentRuns.map((run) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 shadow-border"
                  key={run.id}
                >
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium text-foreground">
                      {run.label}
                    </p>
                    <ClientFormattedDate
                      className="mt-1 block text-xs text-foreground/45"
                      fallback="Time unavailable"
                      format="relative"
                      value={getRunTimestamp(run)}
                    />
                  </div>
                  <Badge variant={RUN_STATUS_VARIANTS[run.status]}>
                    {run.status.toLowerCase()}
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
            <HiArrowPath aria-hidden="true" className="size-4" />
          </Button>
          <Button asChild variant={ButtonVariant.SECONDARY}>
            <Link href={settingsHref}>
              Manage accounts
              <HiArrowRight aria-hidden="true" className="size-4" />
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
          <MetricGrid>
            <Metric label="Total accounts" value={String(summary.total)} />
            <Metric label="Needs attention" value={String(summary.attention)} />
            <Metric label="Healthy" value={String(summary.healthy)} />
            <Metric label="Unknown health" value={String(summary.unknown)} />
          </MetricGrid>

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
  const { filteredActivities, isError, isLoading, refresh } = useActivities({
    limit: 5,
    scope: PageScope.ORGANIZATION,
  });

  return (
    <WorkspaceSurface
      actions={
        <Button asChild variant={ButtonVariant.SECONDARY}>
          <Link href={activityHref}>
            View activity
            <HiArrowRight aria-hidden="true" className="size-4" />
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
      ) : filteredActivities.length === 0 ? (
        <EmptyPanel
          actionHref={activityHref}
          actionLabel="Open activity"
          description="No activity has been recorded for this organization yet."
        />
      ) : (
        <div className="space-y-2">
          {filteredActivities.slice(0, 5).map((activity) => {
            const badge = getActivityBadge(activity);

            return (
              <div
                className={cn(
                  'flex items-center justify-between gap-3 rounded-card bg-background px-4 py-3 shadow-border',
                  activity.isRead && 'opacity-70',
                )}
                key={activity.id}
              >
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-medium text-foreground">
                    {getActivityDescription(activity)}
                  </p>
                  <ClientFormattedDate
                    className="mt-1 block text-xs text-foreground/45"
                    fallback="Time unavailable"
                    format="relative"
                    value={activity.createdAt}
                  />
                </div>
                <Badge variant={badge.variant}>{badge.label}</Badge>
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
  const { credentials, credentialsError, credentialsLoading, refreshBrands } =
    useBrand();
  const {
    activeRuns,
    analytics,
    isError,
    isLoading,
    refresh,
    reviewInbox,
    runs,
    stats,
  } = useOverviewBootstrap();
  const brandSetupHref = createOrganizationAppRoute(
    orgSlug,
    APP_ROUTES.SETTINGS.BRANDS,
  );
  const activityHref = brandSlug
    ? createBrandAppRoute(orgSlug, brandSlug, APP_ROUTES.OVERVIEW.ACTIVITIES)
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
        activeRuns={activeRuns}
        analyticsPendingPosts={analytics.pendingPosts ?? 0}
        brandSlug={brandSlug}
        failedToday={stats?.failedToday ?? 0}
        isError={isError}
        isLoading={isLoading}
        onRetry={refresh}
        orgSlug={orgSlug}
        runs={runs}
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
