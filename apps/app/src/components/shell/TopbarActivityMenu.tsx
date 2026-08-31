'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import {
  ActivityKey,
  ButtonSize,
  ButtonVariant,
  PageScope,
} from '@genfeedai/enums';
import type { IActivity } from '@genfeedai/interfaces';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  getActivityCreditAmount,
  getActivityDescription,
  getActivitySourceLabel,
  getBackgroundTaskStatus,
  isBackgroundTask,
  isCreditActivity,
} from '@pages/activities/activities-list.utils';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Coins,
  LoaderCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  if (status === 'processing' || status === 'pending') {
    return (
      <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 text-info" />
    );
  }
  return (
    <CircleCheck aria-hidden="true" className="mt-0.5 size-4 text-success" />
  );
}

export default function TopbarActivityMenu() {
  const translate = useTranslations('common.activity');
  const { href } = useOrgUrl();
  const activityHref = href(APP_ROUTES.WORKSPACE.ACTIVITY);
  const activityMessageFormatter = useActivityMessageFormatter();
  const { filteredActivities, isError, isLoading } = useActivities({
    limit: TOPBAR_ACTIVITY_LIMIT,
    scope: PageScope.ORGANIZATION,
  });
  const recentActivities = filteredActivities.slice(0, TOPBAR_ACTIVITY_LIMIT);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="size-8"
          ariaLabel={translate('open')}
          data-testid="topbar-activity-menu"
        >
          <Clock className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b border-border px-3 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
            {translate('recentLabel')}
          </h2>
        </div>
        <div className="max-h-80 overflow-y-auto">
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
                const detail = isSimpleCreditChange
                  ? creditDetail
                  : sourceLabel;

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
                      <p className="truncate text-sm font-medium text-foreground">
                        {title}
                      </p>
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
      </PopoverContent>
    </Popover>
  );
}
