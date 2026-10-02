import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import type { Props } from '@props/analytics/platform-performance-section.props';
import Card from '@ui/card/Card';
import MetricItem from '@ui/display/metric-item/MetricItem';
import { PLATFORM_CONFIGS_ARRAY as PLATFORM_CONFIGS } from '@ui-constants/platform.constant';

export default function PlatformPerformanceSection({ topPlatforms }: Props) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-tight">
        Platform Performance Overview
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLATFORM_CONFIGS.map((config) => {
          const platformData = topPlatforms.find(
            (p) => p.platform === config.id,
          );

          const Icon = config.icon;

          return (
            <Card
              key={config.id}
              className="backdrop-blur"
              data-testid={`hook-platform-${config.id}`}
            >
              <div className="p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Icon className="text-2xl" style={{ color: config.color }} />
                  <span className="font-semibold">{config.label}</span>
                </div>

                {platformData ? (
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
                ) : (
                  <p className="text-sm text-foreground/60">
                    No data available
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
