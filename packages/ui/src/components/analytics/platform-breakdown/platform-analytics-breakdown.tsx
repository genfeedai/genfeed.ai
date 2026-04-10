'use client';

import { formatCompactNumber } from '@genfeedai/helpers/formatting/format/format.helper';
import type { IPlatformStats } from '@genfeedai/interfaces';
import type { PlatformAnalyticsBreakdownProps } from '@genfeedai/props/analytics/analytics.props';
import Card from '@ui/card/Card';

export default function PlatformAnalyticsBreakdown({
  analytics,
  className = '',
}: PlatformAnalyticsBreakdownProps) {
  // Group analytics by platform
  const platforms: Record<string, IPlatformStats> = {};
  analytics.forEach((item) => {
    if (!platforms[item.platform]) {
      platforms[item.platform] = {
        engagementRate: 0,
        totalComments: 0,
        totalLikes: 0,
        totalSaves: 0,
        totalShares: 0,
        totalViews: 0,
      };
    }

    platforms[item.platform].totalViews += item.summary.totalViews;
    platforms[item.platform].totalLikes += item.summary.totalLikes;
    platforms[item.platform].totalComments += item.summary.totalComments;
    platforms[item.platform].totalShares += item.summary.totalShares;
  });

  if (!analytics || analytics.length === 0) {
    return null;
  }

  return (
    <Card className={className}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">Platform Breakdown</h3>
        <div className="space-y-4">
          {Object.entries(platforms).map(([platform, stats]) => (
            <div key={platform} className="border-l-4 border-primary pl-4">
              <h4 className="font-semibold capitalize mb-2">{platform}</h4>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Views</span>{' '}
                  <span className="font-medium">
                    {formatCompactNumber(stats.totalViews)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Likes</span>{' '}
                  <span className="font-medium">
                    {formatCompactNumber(stats.totalLikes)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Comments</span>{' '}
                  <span className="font-medium">
                    {formatCompactNumber(stats.totalComments)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Shares</span>{' '}
                  <span className="font-medium">
                    {formatCompactNumber(stats.totalShares)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Engagement</span>{' '}
                  <span className="font-medium">
                    {stats.engagementRate.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
