'use client';

import type { AnalyticsStat } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import Card from '@ui/card/Card';

type PostSidebarAnalyticsCardProps = {
  analyticsStats: AnalyticsStat[];
};

export default function PostSidebarAnalyticsCard({
  analyticsStats,
}: PostSidebarAnalyticsCardProps) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-3">
        {analyticsStats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 bg-secondary text-foreground">
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
