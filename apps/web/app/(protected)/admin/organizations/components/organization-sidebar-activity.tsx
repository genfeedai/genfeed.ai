'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import RowSidebarBreakdown from '@ui/display/row-sidebar/RowSidebarBreakdown';
import RowSidebarSection from '@ui/display/row-sidebar/RowSidebarSection';
import RowSidebarTrend from '@ui/display/row-sidebar/RowSidebarTrend';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { OrganizationSidebarActivityProps } from '@/features/admin/props/analytics.props';
import { toEngagementSeries } from '@/features/analytics/brands-list/brand-sidebar-series';

const TOP_BRANDS_SHOWN = 5;
const EMPTY_SERIES: unknown[] = [];

function toDay(date: Date | null): string | null {
  return date ? format(date, 'yyyy-MM-dd') : null;
}

/**
 * The part of an organization row's sidebar beyond the row's own numbers: how
 * engagement moved over the page's date range, and which brands drove it.
 */
export default function OrganizationSidebarActivity({
  organizationId,
}: OrganizationSidebarActivityProps) {
  const summaryT = useTranslations('ui.rowSidebar.analytics');
  const { dateRange } = useAnalyticsContext();
  const startDay = toDay(dateRange.startDate);
  const endDay = toDay(dateRange.endDate);
  const hasRange = Boolean(startDay && endDay);

  const seriesQuery = useAuthedQuery({
    enabled: hasRange,
    queryFn: async (service) => {
      try {
        return await service.getTimeSeries({
          endDate: endDay ?? '',
          organizationId,
          startDate: startDay ?? '',
        });
      } catch (error) {
        logger.error('Failed to fetch organization sidebar time series', error);
        throw error;
      }
    },
    queryKey: [
      'analytics',
      'organization-sidebar-series',
      organizationId,
      startDay,
      endDay,
    ],
    service: (token: string) => AnalyticsService.getInstance(token),
  });
  const brandsQuery = useAuthedQuery({
    enabled: hasRange,
    queryFn: async (service, signal) => {
      try {
        return await service.getBrandsWithStats(
          {
            endDate: endDay ?? '',
            limit: TOP_BRANDS_SHOWN,
            organizationId,
            page: 1,
            sort: AnalyticsMetric.ENGAGEMENT,
            startDate: startDay ?? '',
          },
          signal,
        );
      } catch (error) {
        logger.error('Failed to fetch organization sidebar brands', error);
        throw error;
      }
    },
    queryKey: [
      'analytics',
      'organization-sidebar-brands',
      organizationId,
      startDay,
      endDay,
    ],
    service: (token: string) => AnalyticsService.getInstance(token),
  });

  const series = Array.isArray(seriesQuery.data)
    ? seriesQuery.data
    : EMPTY_SERIES;
  const engagementPoints = useMemo(() => toEngagementSeries(series), [series]);
  const brandRows = useMemo(() => {
    // Shares are of every brand's engagement, not just the brands shown.
    const totalEngagement = brandsQuery.data?.totals.totalEngagement ?? 0;
    return totalEngagement > 0
      ? (brandsQuery.data?.data ?? [])
          .filter((brand) => brand.totalEngagement > 0)
          .map((brand) => ({
            icon: (
              <BrandAvatar
                alt={brand.name}
                name={brand.name}
                size="2xs"
                src={brand.logo}
              />
            ),
            id: brand.id,
            label: brand.name,
            share: Math.min(
              100,
              (brand.totalEngagement / totalEngagement) * 100,
            ),
            value: formatCompactNumberIntl(brand.totalEngagement),
          }))
      : [];
  }, [brandsQuery.data]);

  return (
    <>
      <RowSidebarSection title={summaryT('engagementTitle')}>
        <RowSidebarTrend
          emptyLabel={summaryT('noEngagement')}
          isLoading={!hasRange || seriesQuery.isLoading}
          label={summaryT('engagementPerDay')}
          points={engagementPoints}
        />
      </RowSidebarSection>

      <RowSidebarSection title={summaryT('brandsTitle')}>
        <RowSidebarBreakdown
          emptyLabel={summaryT('noBrandEngagement')}
          isLoading={!hasRange || brandsQuery.isLoading}
          rows={brandRows}
        />
      </RowSidebarSection>
    </>
  );
}
