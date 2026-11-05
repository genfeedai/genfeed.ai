'use client';

import type { IActivity } from '@genfeedai/contracts/interfaces';
import { ActivitiesService } from '@genfeedai/services/social/activities.service';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { logger } from '@services/core/logger.service';
import RowSidebarBreakdown from '@ui/display/row-sidebar/RowSidebarBreakdown';
import RowSidebarItemList from '@ui/display/row-sidebar/RowSidebarItemList';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { getActivityDescription } from '@/features/activities/activities-list.utils';
import type { UserSidebarActivityProps } from '@/features/admin/props/admin-user.props';

const ACTIVITIES_READ = 50;
const RECENT_ACTIVITIES_SHOWN = 5;
const EMPTY_ACTIVITIES: IActivity[] = [];

/**
 * The part of a user row's sidebar beyond their profile: what they did last,
 * and which organizations their recent activity happened in.
 */
export default function UserSidebarActivity({
  userId,
}: UserSidebarActivityProps) {
  const userT = useTranslations('ui.rowSidebar.user');

  const activitiesQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        return await service.findAllPage(
          { limit: ACTIVITIES_READ, page: 1, userId },
          signal,
        );
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to fetch user sidebar activities', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'users', 'sidebar-activities', userId],
    service: (token: string) => ActivitiesService.getInstance(token),
  });

  const activities: IActivity[] =
    activitiesQuery.data?.items ?? EMPTY_ACTIVITIES;
  const recentItems = useMemo(
    () =>
      activities.slice(0, RECENT_ACTIVITIES_SHOWN).map((activity) => ({
        id: activity.id,
        meta:
          [
            activity.organizationLabel,
            activity.createdAt ? getRelativeTime(activity.createdAt) : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        title: getActivityDescription(activity),
      })),
    [activities],
  );
  const organizationRows = useMemo(() => {
    const counts = new Map<string, { count: number; label: string }>();
    for (const activity of activities) {
      if (!activity.organizationId) {
        continue;
      }
      const current = counts.get(activity.organizationId);
      counts.set(activity.organizationId, {
        count: (current?.count ?? 0) + 1,
        label:
          activity.organizationLabel ?? current?.label ?? userT('unnamedOrg'),
      });
    }
    const total = activities.length;
    return [...counts.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([id, { count, label }]) => ({
        id,
        label,
        share: total > 0 ? Math.min(100, (count / total) * 100) : 0,
        value: formatCompactNumberIntl(count),
      }));
  }, [activities, userT]);

  return (
    <>
      <RowSidebarSection title={userT('recentActivity')}>
        <RowSidebarItemList
          emptyLabel={userT('noActivity')}
          isLoading={activitiesQuery.isLoading}
          items={recentItems}
        />
      </RowSidebarSection>

      <RowSidebarSection title={userT('organizationsTitle')}>
        <RowSidebarBreakdown
          emptyLabel={userT('noOrganizations')}
          isLoading={activitiesQuery.isLoading}
          rows={organizationRows}
        />
      </RowSidebarSection>
    </>
  );
}
