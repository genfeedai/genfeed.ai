'use client';

import type { IAnalytics } from '@genfeedai/interfaces';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { HiEye, HiUserCircle, HiVideoCamera } from 'react-icons/hi2';

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
      icon: <HiVideoCamera className="text-2xl text-primary" />,
      label: 'Total Posts',
      value: stats.totalPosts,
    },
    {
      description:
        stats.viewsGrowth !== undefined
          ? `${stats.viewsGrowth > 0 ? '+' : ''}${stats.viewsGrowth}% from last month`
          : 'No growth data',
      icon: <HiEye className="text-2xl" />,
      label: 'Total Views',
      value: stats.totalViews,
    },
    {
      description: 'YouTube, TikTok, Instagram',
      icon: <HiUserCircle className="text-2xl text-white" />,
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
          icon: HiVideoCamera,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[0].label,
          value: boxes[0].value,
        },
        {
          description: boxes[1].description,
          icon: HiEye,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[1].label,
          value: boxes[1].value,
        },
        {
          description: boxes[2].description,
          icon: HiUserCircle,
          iconClassName: 'bg-white/10 text-foreground',
          label: boxes[2].label,
          value: boxes[2].value,
        },
      ]}
    />
  );
}
