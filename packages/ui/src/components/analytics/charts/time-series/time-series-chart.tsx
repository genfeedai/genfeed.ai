'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import {
  formatChartDate,
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { TimeSeriesChartProps } from '@genfeedai/props/analytics/analytics.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import { Button } from '@ui/primitives/button';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const METRIC_COLORS = {
  comments: 'var(--overlay-white-20)',
  engagementRate: 'var(--overlay-white-15)',
  likes: 'hsl(var(--foreground))',
  saves: 'var(--overlay-white-10)',
  shares: 'var(--overlay-white-15)',
  views: 'hsl(var(--foreground))',
};

const METRIC_LABELS = {
  comments: 'Comments',
  engagementRate: 'Engagement Rate (%)',
  likes: 'Likes',
  saves: 'Saves',
  shares: 'Shares',
  views: 'Views',
};

export function TimeSeriesChart({
  data,
  metrics = [
    AnalyticsMetric.VIEWS,
    AnalyticsMetric.LIKES,
    AnalyticsMetric.COMMENTS,
  ],
  isLoading = false,
  height = 350,
  className = '',
}: TimeSeriesChartProps) {
  type TimeSeriesMetric = keyof typeof METRIC_COLORS;
  const normalizedMetrics = metrics.map(
    (metric) => String(metric) as TimeSeriesMetric,
  );
  const [activeMetrics, setActiveMetrics] =
    useState<TimeSeriesMetric[]>(normalizedMetrics);
  const chartConfig = useMemo(
    () =>
      Object.fromEntries(
        normalizedMetrics.map((metric) => [
          metric,
          {
            color: METRIC_COLORS[metric],
            label: METRIC_LABELS[metric],
          },
        ]),
      ),
    [normalizedMetrics],
  );

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/30 mx-auto mb-3" />
          <p className="text-sm text-white/40">Loading chart data...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-center">
          <p className="text-white/40 mb-2">No data available</p>
          <p className="text-sm text-white/30">
            Try selecting a different date range
          </p>
        </div>
      </div>
    );
  }

  const toggleMetric = (metric: TimeSeriesMetric) => {
    if (activeMetrics.includes(metric)) {
      if (activeMetrics.length > 1) {
        setActiveMetrics(activeMetrics.filter((m) => m !== metric));
      }
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
  };

  const formatValue = (value: number, metric: TimeSeriesMetric) => {
    if (metric === 'engagementRate') {
      return formatPercentageSimple(value, 2);
    }
    return formatCompactNumberIntl(value);
  };

  return (
    <div className={className}>
      {/* Legend / Metric Toggles */}
      <div className="flex flex-wrap gap-3 mb-4">
        {normalizedMetrics.map((metric) => (
          <Button
            type="button"
            key={metric}
            onClick={() => toggleMetric(metric)}
            variant={ButtonVariant.UNSTYLED}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
              activeMetrics.includes(metric)
                ? 'bg-white/10 border-white/20 text-white'
                : 'bg-transparent border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white/80'
            }`}
          >
            <span
              className="inline-block w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: METRIC_COLORS[metric] }}
            />
            {METRIC_LABELS[metric]}
          </Button>
        ))}
      </div>

      {/* Chart */}
      <ChartContainer
        config={chartConfig}
        className="border-white/[0.08] bg-card p-3 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.8)]"
        height={height}
      >
        <AreaChart
          data={data}
          margin={{ bottom: 0, left: 0, right: 30, top: 10 }}
        >
          <defs>
            {activeMetrics.map((metric) => (
              <linearGradient
                key={metric}
                id={`color${metric}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor={METRIC_COLORS[metric]}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={METRIC_COLORS[metric]}
                  stopOpacity={0}
                />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid
            strokeDasharray="0"
            stroke="var(--overlay-white-5)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatChartDate}
            stroke="var(--overlay-white-20)"
            tick={{ fill: 'var(--overlay-white-20)' }}
            style={{ fontSize: '12px' }}
          />
          <YAxis
            stroke="var(--overlay-white-20)"
            tick={{ fill: 'var(--overlay-white-20)' }}
            style={{ fontSize: '12px' }}
          />

          <Tooltip
            content={
              <ChartTooltipContent
                labelFormatter={(label) =>
                  `Date: ${formatChartDate(
                    typeof label === 'string' ||
                      typeof label === 'number' ||
                      label instanceof Date
                      ? label
                      : null,
                  )}`
                }
                valueFormatter={(value, item) =>
                  formatValue(
                    typeof value === 'number'
                      ? value
                      : typeof value === 'string'
                        ? Number(value)
                        : 0,
                    String(item.dataKey ?? item.name ?? '') as TimeSeriesMetric,
                  )
                }
              />
            }
          />
          {activeMetrics.map((metric) => (
            <Area
              key={metric}
              type="monotone"
              dataKey={
                metric as
                  | 'comments'
                  | 'engagementRate'
                  | 'likes'
                  | 'saves'
                  | 'shares'
                  | 'views'
              }
              stroke={METRIC_COLORS[metric]}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#color${metric})`}
            />
          ))}
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
