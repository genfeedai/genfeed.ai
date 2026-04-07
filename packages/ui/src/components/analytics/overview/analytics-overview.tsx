'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { AnalyticsOverviewProps } from '@props/analytics/analytics.props';
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
            iconClassName: 'bg-blue-100 text-blue-600',
            label: 'Posts',
            value: totals.totalPosts,
          },
        ]
      : []),
    {
      icon: FiEye,
      iconClassName: 'bg-green-100 text-green-600',
      label: 'Total Views',
      value: formatCompactNumber(totals.totalViews),
    },
    {
      icon: FiHeart,
      iconClassName: 'bg-red-100 text-red-600',
      label: 'Total Likes',
      value: formatCompactNumber(totals.totalLikes),
    },
    {
      icon: FiMessageCircle,
      iconClassName: 'bg-purple-100 text-purple-600',
      label: 'Comments',
      value: formatCompactNumber(totals.totalComments),
    },
    {
      icon: FiShare2,
      iconClassName: 'bg-orange-100 text-orange-600',
      label: 'Shares',
      value: formatCompactNumber(totals.totalShares),
    },
    {
      icon: FiTrendingUp,
      iconClassName: 'bg-teal-100 text-teal-600',
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
