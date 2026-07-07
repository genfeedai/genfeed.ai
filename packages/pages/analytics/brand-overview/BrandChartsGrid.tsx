'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import type { PlatformComparisonData } from '@props/analytics/analytics.props';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { HiArrowRight } from 'react-icons/hi2';

const PlatformComparisonChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-comparison/platform-comparison-chart'
    ).then((mod) => mod.PlatformComparisonChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

const PlatformTimeSeriesChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-time-series/platform-time-series-chart'
    ).then((mod) => mod.PlatformTimeSeriesChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

type BrandChartsGridProps = {
  basePath: string;
  brandId: string;
  connectedPlatforms: string[];
  isLoading: boolean;
  isLoadingTimeSeries: boolean;
  platformComparisonData: PlatformComparisonData[];
  timeSeriesData: PlatformTimeSeriesDataPoint[];
};

export default function BrandChartsGrid({
  basePath,
  brandId,
  connectedPlatforms,
  isLoading,
  isLoadingTimeSeries,
  platformComparisonData,
  timeSeriesData,
}: BrandChartsGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card label="Platform Comparison">
        <PlatformComparisonChart
          data={platformComparisonData}
          isLoading={isLoading}
          height={300}
        />
        {platformComparisonData.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {platformComparisonData.map(({ platform }) => (
              <Button
                asChild
                key={platform}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors px-3 py-1.5 border border-border hover:border-primary/40"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <Link
                  href={`${basePath}/brands/${brandId}/platforms/${platform}`}
                >
                  {getPlatformIcon(platform, 'size-4')}
                  <span className="capitalize">{platform}</span>
                  <HiArrowRight className="size-3" />
                </Link>
              </Button>
            ))}
          </div>
        )}
      </Card>

      <Card label="Performance Trends">
        <PlatformTimeSeriesChart
          data={timeSeriesData}
          platforms={
            connectedPlatforms.length > 0
              ? (connectedPlatforms as Array<
                  | 'instagram'
                  | 'tiktok'
                  | 'youtube'
                  | 'twitter'
                  | 'facebook'
                  | 'linkedin'
                >)
              : []
          }
          isLoading={isLoadingTimeSeries}
          height={300}
        />
      </Card>
    </div>
  );
}
