'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonSize, ButtonVariant, PageScope } from '@genfeedai/enums';
import type { IActivity } from '@genfeedai/interfaces';
import { useActivities } from '@hooks/data/activities/use-activities/use-activities';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { getActivityDescription } from '@pages/activities/activities-list.utils';
import { Button } from '@ui/primitives/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useActivityMessageFormatter } from '@/hooks/i18n/useActivityMessageFormatter';

export const TOPBAR_ACTIVITY_LIMIT = 5;

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
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
            {translate('label')}
          </p>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading ? (
            <p className="px-2 py-3 text-sm text-foreground/70">
              {translate('loading')}
            </p>
          ) : isError ? (
            <p className="px-2 py-3 text-sm text-foreground/70">
              {translate('error')}
            </p>
          ) : recentActivities.length === 0 ? (
            <p className="px-2 py-3 text-sm text-foreground/70">
              {translate('empty')}
            </p>
          ) : (
            <ul className="space-y-1">
              {recentActivities.map((activity: IActivity) => (
                <li
                  className="rounded-md px-2 py-2"
                  data-testid="topbar-activity-row"
                  key={activity.id}
                >
                  <p className="line-clamp-2 text-sm font-medium text-foreground">
                    {getActivityDescription(activity, activityMessageFormatter)}
                  </p>
                  <ClientFormattedDate
                    className="mt-1 block text-xs text-foreground/45"
                    fallback=""
                    format="relative"
                    value={activity.createdAt}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-1">
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
