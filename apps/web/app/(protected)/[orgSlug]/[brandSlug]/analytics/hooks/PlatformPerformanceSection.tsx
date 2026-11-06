import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import MetricItem from '@ui/display/metric-item/MetricItem';
import PlatformBadge from '@ui/display/platform-badge/PlatformBadge';
import type { Props } from '@/features/analytics/props/platform-performance-section.props';

export default function PlatformPerformanceSection({ topPlatforms }: Props) {
  if (topPlatforms.length === 0) {
    return null;
  }

  return (
    <CollectionGrid as="section" maxColumns={3}>
      {topPlatforms.map((platformData) => (
        <Card
          key={platformData.platform}
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
    </CollectionGrid>
  );
}
