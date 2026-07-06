'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatFullNumber,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { PlatformComparisonMetricType } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import type { PlatformComparisonChartProps } from '@genfeedai/props/analytics/analytics.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), {
  ssr: false,
});
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), {
  ssr: false,
});
const CartesianGrid = dynamic(
  () => import('recharts').then((m) => m.CartesianGrid),
  { ssr: false },
);
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), {
  ssr: false,
});
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), {
  ssr: false,
});
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), {
  ssr: false,
});

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  youtube: 'YouTube',
};

const METRIC_COLORS = {
  comments: 'var(--overlay-white-20)',
  likes: 'var(--accent-violet)',
  shares: 'var(--accent-orange)',
  views: 'hsl(var(--foreground))',
};

export function PlatformComparisonChart({
  data,
  isLoading = false,
  height = 300,
  className = '',
}: PlatformComparisonChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<
    PlatformComparisonMetricType[]
  >([AnalyticsMetric.VIEWS, AnalyticsMetric.LIKES]);
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(METRIC_COLORS) as PlatformComparisonMetricType[]).map(
          (metric) => [
            metric,
            {
              color: METRIC_COLORS[metric],
              label: metric.charAt(0).toUpperCase() + metric.slice(1),
            },
          ],
        ),
      ),
    [],
  );

  const isEmpty = !data || data.length === 0;

  const toggleMetric = (metric: PlatformComparisonMetricType) => {
    setActiveMetrics((previousMetrics) => {
      if (!previousMetrics.includes(metric)) {
        return [...previousMetrics, metric];
      }

      return previousMetrics.length > 1
        ? previousMetrics.filter((m) => m !== metric)
        : previousMetrics;
    });
  };

  const getPlatformLabel = (platform: string) => {
    return PLATFORM_LABELS[platform.toLowerCase()] || platform;
  };

  return (
    <div className={className}>
      {/* Metric Toggle Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(METRIC_COLORS) as PlatformComparisonMetricType[]).map(
          (metric) => (
            <Button
              type="button"
              key={metric}
              onClick={() => toggleMetric(metric)}
              isDisabled={isLoading || isEmpty}
              variant={ButtonVariant.UNSTYLED}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all capitalize border ${
                activeMetrics.includes(metric)
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-transparent border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white/80'
              } ${isLoading || isEmpty ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className="inline-block size-3 rounded-full mr-2"
                style={{ backgroundColor: METRIC_COLORS[metric] }}
              />
              {metric}
            </Button>
          ),
        )}
      </div>

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
            <span className="animate-pulse size-12 rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No platform data available
          </div>
        )}

        {!isEmpty && (
          <ChartContainer
            config={chartConfig}
            className="bg-card shadow-border p-3"
            height="100%"
            style={{ minWidth: 0 }}
          >
            <BarChart
              data={data}
              margin={{ bottom: 5, left: 20, right: 30, top: 5 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="var(--overlay-white-5)"
                vertical={false}
              />
              <XAxis
                dataKey="platform"
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={getPlatformLabel}
                stroke="var(--overlay-white-20)"
              />
              <YAxis
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={formatCompactNumberIntl}
                stroke="var(--overlay-white-20)"
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => getPlatformLabel(String(label))}
                    valueFormatter={(value) =>
                      formatFullNumber(
                        typeof value === 'number'
                          ? value
                          : typeof value === 'string'
                            ? Number(value)
                            : undefined,
                      )
                    }
                  />
                }
              />
              {activeMetrics.includes(AnalyticsMetric.VIEWS) && (
                <Bar
                  dataKey="views"
                  fill={METRIC_COLORS.views}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
              {activeMetrics.includes(AnalyticsMetric.LIKES) && (
                <Bar
                  dataKey="likes"
                  fill={METRIC_COLORS.likes}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
              {activeMetrics.includes(AnalyticsMetric.COMMENTS) && (
                <Bar
                  dataKey="comments"
                  fill={METRIC_COLORS.comments}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
              {activeMetrics.includes(AnalyticsMetric.SHARES) && (
                <Bar
                  dataKey="shares"
                  fill={METRIC_COLORS.shares}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                />
              )}
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
}
