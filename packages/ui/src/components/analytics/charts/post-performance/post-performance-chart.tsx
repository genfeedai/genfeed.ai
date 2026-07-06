'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatFullNumber,
  formatTooltipDateTime,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { PostPerformanceChartProps } from '@genfeedai/props/analytics/charts.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import('recharts').then((m) => m.Area), {
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

type MetricType = AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT;

const METRIC_COLORS = {
  engagement: 'var(--accent-rose)',
  views: 'hsl(var(--foreground))',
};

const METRIC_LABELS = {
  engagement: 'Engagement',
  views: 'Views',
};

const HOURLY_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  hour12: true,
});

const DAILY_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

export function PostPerformanceChart({
  data,
  isLoading = false,
  height = 300,
  className = '',
}: PostPerformanceChartProps) {
  const [activeMetrics, setActiveMetrics] = useState<MetricType[]>([
    AnalyticsMetric.VIEWS,
    AnalyticsMetric.ENGAGEMENT,
  ]);
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(METRIC_COLORS) as MetricType[]).map((metric) => [
          metric,
          {
            color: METRIC_COLORS[metric],
            label: METRIC_LABELS[metric],
          },
        ]),
      ),
    [],
  );

  const isEmpty = !data || data.length === 0;

  const toggleMetric = (metric: MetricType) => {
    setActiveMetrics((previousMetrics) => {
      if (!previousMetrics.includes(metric)) {
        return [...previousMetrics, metric];
      }

      return previousMetrics.length > 1
        ? previousMetrics.filter((m) => m !== metric)
        : previousMetrics;
    });
  };

  // Determine if data is hourly or daily based on timestamps
  const isHourlyData = data.length > 0 && data.length <= 24;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    // Show hour for first 24h, date for daily data
    return isHourlyData
      ? HOURLY_DATE_FORMATTER.format(date)
      : DAILY_DATE_FORMATTER.format(date);
  };

  return (
    <div className={className}>
      {/* Metric Toggle Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(METRIC_COLORS) as MetricType[]).map((metric) => (
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
        ))}
        <div className="ml-auto text-xs text-foreground/60 flex items-center">
          {isHourlyData ? 'Hourly data (first 24h)' : 'Daily data'}
        </div>
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
            No performance data available
          </div>
        )}

        <ChartContainer
          config={chartConfig}
          className="bg-card shadow-border p-3"
          height="100%"
          style={{ minWidth: 0 }}
        >
          <AreaChart
            data={data}
            margin={{ bottom: 5, left: 20, right: 30, top: 5 }}
          >
            <defs>
              <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={METRIC_COLORS.views}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={METRIC_COLORS.views}
                  stopOpacity={0}
                />
              </linearGradient>
              <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={METRIC_COLORS.engagement}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={METRIC_COLORS.engagement}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="0"
              stroke="var(--overlay-white-5)"
              vertical={false}
            />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
              tickFormatter={formatTimestamp}
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
                  labelFormatter={(label) =>
                    formatTooltipDateTime(
                      typeof label === 'string' || typeof label === 'number'
                        ? label
                        : undefined,
                    )
                  }
                  valueFormatter={(value) =>
                    formatFullNumber(
                      typeof value === 'number'
                        ? value
                        : Number(Array.isArray(value) ? value[0] : value) || 0,
                    )
                  }
                />
              }
            />
            {activeMetrics.includes(AnalyticsMetric.VIEWS) && (
              <Area
                type="monotone"
                dataKey="views"
                stroke={METRIC_COLORS.views}
                fillOpacity={1}
                fill="url(#colorViews)"
                strokeWidth={2}
              />
            )}
            {activeMetrics.includes(AnalyticsMetric.ENGAGEMENT) && (
              <Area
                type="monotone"
                dataKey="engagement"
                stroke={METRIC_COLORS.engagement}
                fillOpacity={1}
                fill="url(#colorEngagement)"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}
