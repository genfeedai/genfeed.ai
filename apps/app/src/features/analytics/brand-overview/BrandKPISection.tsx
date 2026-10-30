'use client';

import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@helpers/formatting/format/format.helper';
import KPISection from '@ui/kpi/kpi-section/KPISection';

type BrandKPISectionProps = {
  analytics: IAnalytics | null;
  isLoading: boolean;
  platformCount: number;
};

export default function BrandKPISection({
  analytics,
  isLoading,
  platformCount,
}: BrandKPISectionProps) {
  return (
    <KPISection
      title="Brand Performance"
      gridCols={{ desktop: 3, mobile: 1 }}
      className="bg-background"
      isLoading={isLoading}
      items={[
        {
          analyticsMetric: 'posts' as const,
          label: 'Total Posts',
          value: analytics?.totalPosts || 0,
        },
        {
          description: analytics?.viewsGrowth
            ? `${formatPercentage(analytics.viewsGrowth)} from last period`
            : undefined,
          analyticsMetric: 'views' as const,
          label: 'Total Views',
          value: analytics?.totalViews || 0,
        },
        {
          description: analytics?.engagementGrowth
            ? `${formatPercentage(analytics.engagementGrowth)} from last period`
            : undefined,
          analyticsMetric: analytics?.totalEngagement
            ? ('engagement' as const)
            : analytics?.totalLikes
              ? ('likes' as const)
              : ('engagement' as const),
          label: 'Total Engagement',
          value: analytics?.totalEngagement || analytics?.totalLikes || 0,
        },
        {
          analyticsMetric: 'engagementRate' as const,
          label: 'Engagement Rate',
          value: analytics?.avgEngagementRate
            ? `${analytics.avgEngagementRate.toFixed(2)}%`
            : '0%',
        },
        {
          label: 'Active Platforms',
          value: platformCount,
        },
        {
          analyticsMetric: 'views' as const,
          label: 'Avg Views/Post',
          analyticsMetricVariant: 'perPost' as const,
          value:
            analytics?.totalPosts && analytics?.totalViews
              ? formatCompactNumberIntl(
                  analytics.totalViews / analytics.totalPosts,
                )
              : 0,
        },
      ]}
    />
  );
}
