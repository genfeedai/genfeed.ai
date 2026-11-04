'use client';

import { AnalyticsMetric } from '@genfeedai/contracts';
import type { IAccountAnalyticsSeriesPoint } from '@genfeedai/contracts/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import RowSidebarItemList from '@ui/display/row-sidebar/RowSidebarItemList';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarTrend from '@ui/display/row-sidebar/RowSidebarTrend';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useAccountAnalyticsDetail } from '@/features/analytics/accounts/use-account-analytics-detail';
import type { AnalyticsAccountSummaryProps } from '@/features/analytics/props/analytics-account-summary.props';

const TOP_POSTS_SHOWN = 3;

/** Views gained per day, oldest first; days the platform did not report are left out. */
export function toViewsSeries(
  series: IAccountAnalyticsSeriesPoint[],
): number[] {
  return series.flatMap((point) => {
    const views = point.metrics.find(
      (metric) => metric.metric === AnalyticsMetric.VIEWS,
    );
    return views?.availability === 'observed' && views.change !== null
      ? [views.change]
      : [];
  });
}

/**
 * Right-sidebar body for an account row in the analytics accounts table: the
 * row's own facts, then how views moved over the selected range and the
 * account's best posts. It reads the same cached detail as the account page.
 */
export default function AnalyticsAccountSummary({
  account,
  facts,
  openHref,
}: AnalyticsAccountSummaryProps) {
  const summaryT = useTranslations('ui.rowSidebar.analytics');
  const detailQuery = useAccountAnalyticsDetail(account.identity.credentialId);
  const detail = detailQuery.data;
  const isLoading = detailQuery.isPending;

  const viewsPoints = useMemo(
    () => toViewsSeries(detail?.series ?? []),
    [detail?.series],
  );
  const topPosts = (detail?.topPosts ?? []).slice(0, TOP_POSTS_SHOWN);

  return (
    <TableRowSummary
      facts={facts}
      openHref={openHref}
      openLabel={summaryT('openAccount')}
    >
      <RowSidebarSection title={summaryT('viewsTitle')}>
        <RowSidebarTrend
          emptyLabel={summaryT('noViews')}
          isLoading={isLoading}
          label={summaryT('viewsPerDay')}
          points={viewsPoints}
        />
      </RowSidebarSection>

      <RowSidebarSection title={summaryT('topPostsTitle')}>
        <RowSidebarItemList
          emptyLabel={summaryT('noPosts')}
          isLoading={isLoading}
          items={topPosts.map((post) => ({
            icon: post.platform
              ? getPlatformIcon(post.platform, 'size-4')
              : null,
            id: post.postId,
            meta: summaryT('postViews', {
              count: formatCompactNumberIntl(post.views),
            }),
            title: post.title || summaryT('untitledPost'),
          }))}
        />
      </RowSidebarSection>
    </TableRowSummary>
  );
}
