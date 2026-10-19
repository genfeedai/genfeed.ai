import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { Props } from '@props/analytics/platform-performance-section.props';
import Card from '@ui/card/Card';
import MetricItem from '@ui/display/metric-item/MetricItem';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';

export default function PlatformPerformanceSection({ topPlatforms }: Props) {
  if (topPlatforms.length === 0) {
    return null;
  }

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {topPlatforms.map((platformData) => (
        <Card
          key={platformData.platform}
          className="backdrop-blur"
          data-testid={`hook-platform-${platformData.platform}`}
        >
          <div className="space-y-4 p-4">
            <PlatformBadge platform={platformData.platform} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <MetricItem
                analyticsMetric="views"
                label="Total Views"
                value={formatCompactNumber(platformData.totalViews)}
              />
              <MetricItem
                analyticsMetric="engagement"
                label="Total Engagement"
                value={formatCompactNumber(platformData.totalEngagement)}
              />
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}
