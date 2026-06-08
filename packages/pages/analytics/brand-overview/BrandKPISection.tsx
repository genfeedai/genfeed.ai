'use client';

import type { IAnalytics } from '@genfeedai/interfaces';
import { formatCompactNumberIntl } from '@helpers/formatting/format/format.helper';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  HiChartBar,
  HiEye,
  HiFire,
  HiGlobeAlt,
  HiHeart,
  HiVideoCamera,
} from 'react-icons/hi2';

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
      gridCols={{ desktop: 3, mobile: 1, tablet: 3 }}
      className="bg-background"
      isLoading={isLoading}
      items={[
        {
          description: 'Published content',
          icon: HiVideoCamera,
          iconClassName: 'bg-white/10 text-foreground',
          label: 'Total Posts',
          value: analytics?.totalPosts || 0,
        },
        {
          description: analytics?.viewsGrowth
            ? `${analytics.viewsGrowth > 0 ? '+' : ''}${analytics.viewsGrowth}% from last period`
            : 'Total views',
          icon: HiEye,
          iconClassName: 'bg-white/10 text-foreground',
          label: 'Total Views',
          value: analytics?.totalViews || 0,
        },
        {
          description: analytics?.engagementGrowth
            ? `${analytics.engagementGrowth > 0 ? '+' : ''}${analytics.engagementGrowth}% from last period`
            : 'Total engagement',
          icon: HiHeart,
          iconClassName: 'bg-white/10 text-foreground',
          label: 'Total Engagement',
          value: analytics?.totalEngagement || analytics?.totalLikes || 0,
        },
        {
          description: 'Average engagement rate',
          icon: HiFire,
          iconClassName: 'bg-white/10 text-foreground',
          label: 'Engagement Rate',
          value: analytics?.avgEngagementRate
            ? `${analytics.avgEngagementRate.toFixed(2)}%`
            : '0%',
        },
        {
          description: 'Publishing channels',
          icon: HiGlobeAlt,
          iconClassName: 'bg-white/10 text-foreground',
          label: 'Active Platforms',
          value: platformCount,
        },
        {
          description: 'Per content piece',
          icon: HiChartBar,
          iconClassName: 'bg-white/10 text-foreground',
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
