'use client';

import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import Card from '@ui/card/Card';

type PostSidebarAnalyticsCardProps = {
  analyticsStats: AnalyticsStat[];
};

export default function PostSidebarAnalyticsCard({
  analyticsStats,
}: PostSidebarAnalyticsCardProps) {
  const getIconBgClass = (accent: string) => {
    if (accent.includes('primary')) {
      return 'bg-green-100 text-green-600';
    }
    if (accent.includes('rose')) {
      return 'bg-red-100 text-red-600';
    }
    if (accent.includes('secondary')) {
      return 'bg-purple-100 text-purple-600';
    }
    if (accent.includes('warning')) {
      return 'bg-orange-100 text-orange-600';
    }
    if (accent.includes('success')) {
      return 'bg-teal-100 text-teal-600';
    }
    return 'bg-background text-foreground';
  };

  return (
    <Card>
      <div className="grid grid-cols-2 gap-3">
        {analyticsStats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <div className={`flex-shrink-0 p-2 ${getIconBgClass(stat.accent)}`}>
              <stat.icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground/60 mb-0.5">{stat.label}</p>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
