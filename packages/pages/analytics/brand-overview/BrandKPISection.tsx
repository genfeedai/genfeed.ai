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
          description: 'Published content',
          analyticsMetric: 'posts' as const,
          label: 'Total Posts',
          value: analytics?.totalPosts || 0,
        },
        {
          description: analytics?.viewsGrowth
            ? `${formatPercentage(analytics.viewsGrowth)} from last period`
            : 'Total views',
          analyticsMetric: 'views' as const,
          label: 'Total Views',
          value: analytics?.totalViews || 0,
        },
        {
          description: analytics?.engagementGrowth
            ? `${formatPercentage(analytics.engagementGrowth)} from last period`
            : 'Total engagement',
          analyticsMetric: 'engagement' as const,
          label: 'Total Engagement',
          value: analytics?.totalEngagement || analytics?.totalLikes || 0,
        },
        {
          description: 'Average engagement rate',
          analyticsMetric: 'engagementRate' as const,
          label: 'Engagement Rate',
          value: analytics?.avgEngagementRate
            ? `${analytics.avgEngagementRate.toFixed(2)}%`
            : '0%',
        },
        {
          description: 'Publishing channels',
          label: 'Active Platforms',
          value: platformCount,
        },
        {
          description: 'Per content piece',
          analyticsMetric: 'views' as const,
          label: 'Avg Views/Post',
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
