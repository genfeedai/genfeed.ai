'use client';

import type { IAnalytics } from '@genfeedai/interfaces';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { CircleUser, Eye, Video } from 'lucide-react';

type Props = {
  isLoading: boolean;
  stats: IAnalytics;
};

export default function AnalyticsKPISection({ isLoading, stats }: Props) {
  const boxes = [
    {
      description:
        stats.monthlyGrowth !== undefined
          ? `${stats.monthlyGrowth > 0 ? '+' : ''}${stats.monthlyGrowth}% from last month`
          : 'No growth data',
      icon: <Video className="text-2xl text-primary" />,
      label: 'Total Posts',
      value: stats.totalPosts,
    },
    {
      description:
        stats.viewsGrowth !== undefined
          ? `${stats.viewsGrowth > 0 ? '+' : ''}${stats.viewsGrowth}% from last month`
          : 'No growth data',
      icon: <Eye className="text-2xl" />,
      label: 'Total Views',
      value: stats.totalViews,
    },
    {
      description: 'YouTube, TikTok, Instagram',
      icon: <CircleUser className="text-2xl text-white" />,
      label: 'Connected Accounts',
      value: stats.totalCredentialsConnected,
    },
  ];

  return (
    <KPISection
      title="Analytics Overview"
      isLoading={isLoading}
      gridCols={{ desktop: 3, mobile: 1, tablet: 2 }}
      className="bg-background"
      items={[
        {
          description: boxes[0].description,
          icon: Video,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[0].label,
          value: boxes[0].value,
        },
        {
          description: boxes[1].description,
          icon: Eye,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[1].label,
          value: boxes[1].value,
        },
        {
          description: boxes[2].description,
          icon: CircleUser,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[2].label,
          value: boxes[2].value,
        },
      ]}
    />
  );
}
