'use client';

import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import type { AnalyticsBrandSummaryProps } from '@props/analytics/analytics-brand-summary.props';
import TableRowSummary from '@ui/display/table/TableRowSummary';
import { useTranslations } from 'next-intl';

/** Right-sidebar body for a brand row in the analytics brand tables. */
export default function AnalyticsBrandSummary({
  brand,
  openHref,
}: AnalyticsBrandSummaryProps) {
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const summaryT = useTranslations('ui.rowSidebar.analytics');

  return (
    <TableRowSummary
      facts={[
        {
          id: 'organization',
          label: fieldsT('organization'),
          value: brand.organizationName,
        },
        {
          id: 'platforms',
          label: fieldsT('platforms'),
          value: brand.activePlatforms.join(', '),
        },
        {
          id: 'posts',
          label: fieldsT('posts'),
          value: formatCompactNumberIntl(brand.totalPosts),
        },
        {
          id: 'views',
          label: fieldsT('views'),
          value: formatCompactNumberIntl(brand.totalViews),
        },
        {
          id: 'engagement',
          label: fieldsT('engagement'),
          value: formatCompactNumberIntl(brand.totalEngagement),
        },
        {
          id: 'engagementRate',
          label: fieldsT('engagementRate'),
          value: formatPercentageSimple(brand.avgEngagementRate, 2),
        },
        {
          id: 'growth',
          label: fieldsT('growth'),
          value: summaryT('growthVsLastPeriod', {
            value: `${brand.growth > 0 ? '+' : ''}${formatPercentageSimple(brand.growth, 2)}`,
          }),
        },
      ]}
      openHref={openHref}
      openLabel={summaryT('openBrand')}
    />
  );
}
