'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { PostStatus } from '@genfeedai/contracts';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Post } from '@models/content/post.model';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import RowSidebarBreakdown from '@ui/display/row-sidebar/RowSidebarBreakdown';
import RowSidebarItemList from '@ui/display/row-sidebar/RowSidebarItemList';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarStats from '@ui/display/row-sidebar/RowSidebarStats';
import RowSidebarTrend from '@ui/display/row-sidebar/RowSidebarTrend';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  toEngagementSeries,
  toPlatformShares,
} from '@/features/analytics/brands-list/brand-sidebar-series';
import { chartPlatformLabel } from '@/features/analytics/components/analytics/charts/chart-theme';
import type { AnalyticsBrandSummaryProps } from '@/features/analytics/props/analytics-brand-summary.props';

const EMPTY_LIST: unknown[] = [];
const EMPTY_POSTS: Post[] = [];
const POSTS_FETCHED = 20;
const TOP_POSTS_SHOWN = 3;
const PUBLISHED_STATUSES: string[] = [
  PostStatus.PUBLIC,
  PostStatus.PRIVATE,
  PostStatus.UNLISTED,
];

type PostWithViews = Post & { totalViews?: number };

function toIsoDay(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Right-sidebar body for a brand row in the analytics brand tables: the
 * headline numbers from the row, then how engagement moved over the selected
 * range, which platforms drove it, and the posts that did best.
 */
export default function AnalyticsBrandSummary({
  brand,
  openHref,
}: AnalyticsBrandSummaryProps) {
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const summaryT = useTranslations('ui.rowSidebar.analytics');
  const { dateRange } = useAnalyticsContext();
  const { endDate, startDate } = dateRange;
  const startDay = startDate ? toIsoDay(startDate) : null;
  const endDay = endDate ? toIsoDay(endDate) : null;

  const seriesQuery = useAuthedQuery({
    enabled: Boolean(startDay && endDay),
    queryFn: async (service) => {
      try {
        return await service.findBrandAnalyticsTimeSeries(brand.id, {
          endDate: endDay ?? '',
          groupBy: 'day',
          startDate: startDay ?? '',
        });
      } catch (error) {
        logger.error('Failed to fetch brand sidebar time series', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-sidebar-series', brand.id, startDay, endDay],
    service: (token: string) => BrandsService.getInstance(token),
  });
  const postsQuery = useAuthedQuery({
    queryFn: async (service) => {
      try {
        return await service.findBrandPosts(brand.id, {
          limit: POSTS_FETCHED,
          page: 1,
          sort: '-createdAt',
        });
      } catch (error) {
        logger.error('Failed to fetch brand sidebar posts', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-sidebar-posts', brand.id],
    service: (token: string) => BrandsService.getInstance(token),
  });

  // A section paints its skeleton only while it has nothing to show: a row
  // opened a second time shows what it loaded before and refreshes quietly.
  const series: unknown[] = seriesQuery.data ?? EMPTY_LIST;
  const posts: Post[] = postsQuery.data ?? EMPTY_POSTS;
  const isLoadingSeries = seriesQuery.isLoading || !startDay || !endDay;
  const isLoadingPosts = postsQuery.isLoading;

  const engagementPoints = useMemo(() => toEngagementSeries(series), [series]);
  const platformShares = useMemo(() => toPlatformShares(series), [series]);
  const topPosts = useMemo(
    () =>
      posts
        .filter((post) => PUBLISHED_STATUSES.includes(post.status as string))
        .sort(
          (a, b) =>
            ((b as PostWithViews).totalViews ?? 0) -
            ((a as PostWithViews).totalViews ?? 0),
        )
        .slice(0, TOP_POSTS_SHOWN),
    [posts],
  );

  return (
    <TableRowSummary openHref={openHref} openLabel={summaryT('openBrand')}>
      <RowSidebarStats
        stats={[
          {
            id: 'views',
            label: fieldsT('views'),
            value: formatCompactNumberIntl(brand.totalViews),
          },
          {
            id: 'engagement',
            label: fieldsT('engagement'),
            trend: brand.growth,
            trendLabel: summaryT('vsLastPeriod'),
            value: formatCompactNumberIntl(brand.totalEngagement),
          },
          {
            id: 'engagementRate',
            label: fieldsT('engagementRate'),
            value: formatPercentageSimple(brand.avgEngagementRate, 2),
          },
          {
            id: 'posts',
            label: fieldsT('posts'),
            value: formatCompactNumberIntl(brand.totalPosts),
          },
        ]}
      />

      <RowSidebarSection title={summaryT('engagementTitle')}>
        <RowSidebarTrend
          emptyLabel={summaryT('noEngagement')}
          isLoading={isLoadingSeries}
          label={summaryT('engagementPerDay')}
          points={engagementPoints}
        />
      </RowSidebarSection>

      <RowSidebarSection title={summaryT('platformsTitle')}>
        <RowSidebarBreakdown
          emptyLabel={summaryT('noPlatforms')}
          isLoading={isLoadingSeries}
          rows={platformShares.map((entry) => ({
            icon: getPlatformIcon(entry.platform, 'size-4'),
            id: entry.platform,
            label: chartPlatformLabel(entry.platform),
            share: entry.share,
            value: formatCompactNumberIntl(entry.engagement),
          }))}
        />
      </RowSidebarSection>

      <RowSidebarSection title={summaryT('topPostsTitle')}>
        <RowSidebarItemList
          emptyLabel={summaryT('noPosts')}
          isLoading={isLoadingPosts}
          items={topPosts.map((post) => ({
            icon: post.platform
              ? getPlatformIcon(post.platform, 'size-4')
              : null,
            id: post.id,
            meta: summaryT('postViews', {
              count: formatCompactNumberIntl(
                (post as PostWithViews).totalViews ?? 0,
              ),
            }),
            title:
              stripHtmlToPlainText(post.description) ||
              summaryT('untitledPost'),
          }))}
        />
      </RowSidebarSection>
    </TableRowSummary>
  );
}
