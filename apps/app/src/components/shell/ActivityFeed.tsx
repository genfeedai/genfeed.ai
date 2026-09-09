'use client';

import { ActivityKey, ButtonVariant, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IActivity } from '@genfeedai/contracts/interfaces';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getActivityCreditAmount,
  getActivityDescription,
  getActivitySourceLabel,
  getBackgroundTaskStatus,
  isBackgroundTask,
  isCreditActivity,
  parseActivityValue,
} from '@pages/activities/activities-list.utils';
import GenerationStatus from '@ui/feedback/generation-status/GenerationStatus';
import { Button } from '@ui/primitives/button';
import { CircleAlert, CircleCheck, Coins } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  getGenerationActivityStatus,
  isActiveGenerationActivity,
} from '@/components/shell/generation-activity.utils';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';

export const TOPBAR_ACTIVITY_LIMIT = 5;

function ActivityStatusIcon({
  isCredit,
  status,
}: {
  isCredit: boolean;
  status: string;
}) {
  if (isCredit) {
    return <Coins aria-hidden="true" className="mt-0.5 size-4 text-info" />;
  }
  if (status === 'failed') {
    return (
      <CircleAlert
        aria-hidden="true"
        className="mt-0.5 size-4 text-destructive"
      />
    );
  }
  if (status === 'processing' || status === 'pending') return null;
  return (
    <CircleCheck aria-hidden="true" className="mt-0.5 size-4 text-success" />
  );
}

interface ActivityFeedContentProps {
  filteredActivities: IActivity[];
  isError: boolean;
  isLoading: boolean;
  getActivityHref?: (activity: IActivity) => string | null;
  onNavigate?: () => void;
  connectionState?: string;
}

export default function ActivityFeed() {
  const data = useActivities({
    limit: TOPBAR_ACTIVITY_LIMIT,
    scope: PageScope.ORGANIZATION,
  });
  return <ActivityFeedContent {...data} />;
}

export function ActivityFeedContent({
  filteredActivities,
  isError,
  isLoading,
  getActivityHref,
  onNavigate,
  connectionState,
}: ActivityFeedContentProps) {
  const translate = useTranslations('common.activity');
  const { href } = useOrgUrl();
  const activityHref = href(APP_ROUTES.WORKSPACE.ACTIVITY);
  const activityMessageFormatter = useActivityMessageFormatter();
  const recentActivities = [...filteredActivities]
    .sort(
      (left, right) =>
        Number(isActiveGenerationActivity(right)) -
        Number(isActiveGenerationActivity(left)),
    )
    .slice(
      0,
      Math.max(
        TOPBAR_ACTIVITY_LIMIT,
        filteredActivities.filter(isActiveGenerationActivity).length,
      ),
    );

  return (
    <>
      <div className="max-h-80 overflow-y-auto">
        {connectionState === 'offline' || connectionState === 'reconnecting' ? (
          <p role="status" className="px-3 py-2 text-xs text-muted-foreground">
            {translate('reconnecting')}
          </p>
        ) : null}
        {isLoading ? (
          <p className="px-3 py-4 text-sm text-foreground/70">
            {translate('loading')}
          </p>
        ) : isError ? (
          <p className="px-3 py-4 text-sm text-foreground/70">
            {translate('error')}
          </p>
        ) : recentActivities.length === 0 ? (
          <p className="px-3 py-4 text-sm text-foreground/70">
            {translate('empty')}
          </p>
        ) : (
          <ol className="divide-y divide-border/60">
            {recentActivities.map((activity: IActivity) => {
              const creditActivity = isCreditActivity(activity.key);
              const creditAmount = getActivityCreditAmount(activity);
              const sourceLabel = getActivitySourceLabel(activity.source);
              const isCreditAdded = activity.key === ActivityKey.CREDITS_ADD;
              const isSimpleCreditChange =
                activity.key === ActivityKey.CREDITS_ADD ||
                activity.key === ActivityKey.CREDITS_REMOVE;
              const status = isBackgroundTask(activity)
                ? getBackgroundTaskStatus(activity.key)
                : (activity.status ?? 'completed');
              const creditDetail =
                isSimpleCreditChange && creditAmount !== null
                  ? translate(isCreditAdded ? 'creditAdded' : 'creditUsage', {
                      count: creditAmount,
                    })
                  : null;
              const title = isSimpleCreditChange
                ? (sourceLabel ??
                  translate(
                    isCreditAdded ? 'creditBalanceLabel' : 'creditUsageLabel',
                  ))
                : getActivityDescription(activity, activityMessageFormatter);
              const detail = isSimpleCreditChange ? creditDetail : sourceLabel;
              const destination = getActivityHref?.(activity);
              const progress = parseActivityValue(activity.value);
              const titleContent = isBackgroundTask(activity) ? (
                <GenerationStatus
                  compact
                  completedCount={
                    typeof progress?.completedCount === 'number'
                      ? progress.completedCount
                      : undefined
                  }
                  totalCount={
                    typeof progress?.totalCount === 'number'
                      ? progress.totalCount
                      : undefined
                  }
                  status={getGenerationActivityStatus(activity)}
                  label={
                    getGenerationActivityStatus(activity) === 'cancelled'
                      ? undefined
                      : title
                  }
                  startedAt={activity.createdAt}
                />
              ) : (
                title
              );

              return (
                <li
                  className="relative flex gap-2.5 px-3 py-2.5"
                  data-testid="topbar-activity-row"
                  key={activity.id}
                >
                  <ActivityStatusIcon
                    isCredit={creditActivity}
                    status={status}
                  />
                  <div className="min-w-0 flex-1">
                    {destination ? (
                      <Link
                        href={destination}
                        onClick={onNavigate}
                        className="block text-sm font-medium text-foreground hover:underline"
                      >
                        {titleContent}
                      </Link>
                    ) : (
                      <div className="text-sm font-medium text-foreground">
                        {titleContent}
                      </div>
                    )}
                    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-foreground/55">
                      {detail ? (
                        <>
                          <span className="truncate">{detail}</span>
                          <span aria-hidden="true" className="shrink-0">
                            ·
                          </span>
                        </>
                      ) : null}
                      <ClientFormattedDate
                        className="shrink-0"
                        fallback=""
                        format="relative"
                        value={activity.createdAt}
                      />
                    </div>
                  </div>
                  {!activity.isRead ? (
                    <span
                      aria-hidden="true"
                      className="mt-1 size-1.5 shrink-0 rounded-full bg-info"
                      data-testid="activity-unread-dot"
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <div className="border-t border-border p-1.5">
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          withWrapper={false}
          className="w-full justify-center"
        >
          <Link href={activityHref}>{translate('viewAll')}</Link>
        </Button>
      </div>
    </>
  );
}
