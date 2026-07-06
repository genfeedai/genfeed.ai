'use client';

import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { AnalyticsOverviewProps } from '@genfeedai/props/analytics/analytics.props';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  FiEye,
  FiHeart,
  FiMessageCircle,
  FiShare2,
  FiTrendingUp,
  FiVideo,
} from 'react-icons/fi';

export default function AnalyticsOverview({
  analytics,
  isLoading = false,
  showPostsCount = true,
  className = '',
}: AnalyticsOverviewProps) {
  // Calculate totals from analytics data
  const totals = analytics.reduce(
    (acc, item) => {
      acc.totalPosts += 1;
      acc.totalViews += item.summary.totalViews;
      acc.totalLikes += item.summary.totalLikes;
      acc.totalComments += item.summary.totalComments;
      acc.totalShares += item.summary.totalShares;
      acc.avgEngagementRate += item.summary.avgEngagementRate;
      return acc;
    },
    {
      avgEngagementRate: 0,
      totalComments: 0,
      totalLikes: 0,
      totalPosts: 0,
      totalShares: 0,
      totalViews: 0,
    },
  );

  // Calculate average engagement rate
  if (analytics.length > 0) {
    totals.avgEngagementRate = totals.avgEngagementRate / analytics.length;
  }

  const items = [
    ...(showPostsCount
      ? [
          {
            icon: FiVideo,
            iconClassName: 'bg-muted text-muted-foreground',
            label: 'Posts',
            value: totals.totalPosts,
          },
        ]
      : []),
    {
      icon: FiEye,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Total Views',
      value: formatCompactNumber(totals.totalViews),
    },
    {
      icon: FiHeart,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Total Likes',
      value: formatCompactNumber(totals.totalLikes),
    },
    {
      icon: FiMessageCircle,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Comments',
      value: formatCompactNumber(totals.totalComments),
    },
    {
      icon: FiShare2,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Shares',
      value: formatCompactNumber(totals.totalShares),
    },
    {
      icon: FiTrendingUp,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Avg Engagement',
      value: `${totals.avgEngagementRate.toFixed(2)}%`,
    },
  ];

  return (
    <KPISection
      title="Analytics Overview"
      items={items}
      isLoading={isLoading}
      gridCols={{
        desktop: showPostsCount ? 6 : 5,
        mobile: 1,
        tablet: 2,
      }}
      className={className}
    />
  );
}
