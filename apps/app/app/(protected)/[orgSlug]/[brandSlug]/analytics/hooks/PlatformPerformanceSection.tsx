'use client';

import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import MetricItem from '@ui/display/metric-item/MetricItem';
import { PLATFORM_CONFIGS_ARRAY as PLATFORM_CONFIGS } from '@ui-constants/platform.constant';

type AggregatedPlatform = {
  platform: string;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  avgEngagement: number;
  avgViralScore: number;
  videoCount: number;
};

type Props = {
  aggregatedPlatformData: AggregatedPlatform[];
};

export default function PlatformPerformanceSection({
  aggregatedPlatformData,
}: Props) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold tracking-tight">
        Platform Performance Overview
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PLATFORM_CONFIGS.map((config) => {
          const platformData = aggregatedPlatformData.find(
            (p) => p.platform === config.id,
          );

          const Icon = config.icon;

          return (
            <Card key={config.id} className="backdrop-blur">
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon
                      className="text-2xl"
                      style={{ color: config.color }}
                    />
                    <span className="font-semibold">{config.label}</span>
                  </div>
                  {platformData && (
                    <Badge className="bg-primary text-primary-foreground text-xs">
                      {platformData.videoCount} videos
                    </Badge>
                  )}
                </div>

                {platformData ? (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <MetricItem
                      label="Total Views"
                      value={formatCompactNumber(platformData.totalViews)}
                    />
                    <MetricItem
                      label="Total Likes"
                      value={formatCompactNumber(platformData.totalLikes)}
                    />
                    <MetricItem
                      label="Avg Engagement"
                      value={`${platformData.avgEngagement.toFixed(1)}%`}
                    />
                    <MetricItem
                      label="Viral Score"
                      value={platformData.avgViralScore.toFixed(0)}
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
