'use client';

import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { AdminOrganizationCreditsService } from '@services/admin/organization-credits.service';
import { logger } from '@services/core/logger.service';
import RowSidebarBreakdown from '@ui/display/row-sidebar/RowSidebarBreakdown';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarTrend from '@ui/display/row-sidebar/RowSidebarTrend';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { SubscriptionSidebarActivityProps } from '@/features/admin/props/subscription-sidebar.props';

/**
 * The part of a subscription row's sidebar beyond the row's own numbers: how
 * many credits the organization used each day of the last 30, and on what.
 */
export default function SubscriptionSidebarActivity({
  organizationId,
}: SubscriptionSidebarActivityProps) {
  const subscriptionT = useTranslations('ui.rowSidebar.subscription');

  const usageQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        return await service.getUsage(organizationId, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to fetch subscription sidebar usage', error);
        }
        throw error;
      }
    },
    queryKey: ['admin', 'subscriptions', 'sidebar-usage', organizationId],
    service: (token: string) =>
      AdminOrganizationCreditsService.getInstance(token),
  });

  const usage = usageQuery.data;
  const dailyPoints = useMemo(
    () => (usage?.dailySeries ?? []).map((point) => point.amount),
    [usage],
  );
  const sourceRows = useMemo(() => {
    const total = usage?.usage30Days ?? 0;
    return total > 0
      ? (usage?.breakdown ?? [])
          .filter((row) => row.amount > 0)
          .map((row) => ({
            id: row.source,
            label: row.source,
            share: Math.min(100, (row.amount / total) * 100),
            value: formatCompactNumberIntl(row.amount),
          }))
      : [];
  }, [usage]);

  return (
    <>
      <RowSidebarSection title={subscriptionT('usageTitle')}>
        <RowSidebarTrend
          emptyLabel={subscriptionT('noUsage')}
          isLoading={usageQuery.isLoading}
          label={subscriptionT('usagePerDay')}
          points={dailyPoints}
        />
      </RowSidebarSection>

      <RowSidebarSection title={subscriptionT('sourcesTitle')}>
        <RowSidebarBreakdown
          emptyLabel={subscriptionT('noSources')}
          isLoading={usageQuery.isLoading}
          rows={sourceRows}
        />
      </RowSidebarSection>
    </>
  );
}
