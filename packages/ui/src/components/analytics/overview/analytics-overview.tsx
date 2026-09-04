'use client';

import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { AnalyticsOverviewProps } from '@genfeedai/props/analytics/analytics.props';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import {
  Eye,
  Heart,
  MessageCircle,
  Share2,
  TrendingUp,
  Video,
} from 'lucide-react';

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
            icon: Video,
            iconClassName: 'bg-muted text-muted-foreground',
            label: 'Posts',
            value: totals.totalPosts,
            valueClassName: 'tabular-nums',
          },
        ]
      : []),
    {
      icon: Eye,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Total Views',
      value: formatCompactNumber(totals.totalViews),
      valueClassName: 'tabular-nums',
    },
    {
      icon: Heart,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Total Likes',
      value: formatCompactNumber(totals.totalLikes),
      valueClassName: 'tabular-nums',
    },
    {
      icon: MessageCircle,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Comments',
      value: formatCompactNumber(totals.totalComments),
      valueClassName: 'tabular-nums',
    },
    {
      icon: Share2,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Shares',
      value: formatCompactNumber(totals.totalShares),
      valueClassName: 'tabular-nums',
    },
    {
      icon: TrendingUp,
      iconClassName: 'bg-muted text-muted-foreground',
      label: 'Avg Engagement',
      value: `${totals.avgEngagementRate.toFixed(2)}%`,
      valueClassName: 'tabular-nums',
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
