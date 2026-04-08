'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatFullNumber,
  formatTooltipDateTime,
} from '@helpers/formatting/format/format.helper';
import type { PostPerformanceChartProps } from '@props/analytics/charts.props';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type MetricType = AnalyticsMetric.VIEWS | AnalyticsMetric.ENGAGEMENT;

const METRIC_COLORS = {
  engagement: 'var(--accent-rose)',
  views: 'hsl(var(--foreground))',
};

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

  const isEmpty = !data || data.length === 0;

  const toggleMetric = (metric: MetricType) => {
    if (activeMetrics.includes(metric)) {
      if (activeMetrics.length > 1) {
        setActiveMetrics(activeMetrics.filter((m) => m !== metric));
      }
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
  };

  // Determine if data is hourly or daily based on timestamps
  const isHourlyData = data.length > 0 && data.length <= 24;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isHourlyData) {
      // Show hour for first 24h
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: true,
      }).format(date);
    } else {
      // Show date for daily data
      return new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'short',
      }).format(date);
    }
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
              className="inline-block w-3 h-3 rounded-full mr-2"
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
            <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No performance data available
          </div>
        )}

        <ResponsiveContainer width="100%" height={height}>
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
              formatter={(value, name) => {
                const numericValue =
                  typeof value === 'number'
                    ? value
                    : Number(Array.isArray(value) ? value[0] : value) || 0;
                const displayName =
                  typeof name === 'string'
                    ? name.charAt(0).toUpperCase() + name.slice(1)
                    : String(name ?? '');

                return [formatFullNumber(numericValue), displayName];
              }}
              labelFormatter={(label) =>
                formatTooltipDateTime(
                  typeof label === 'string' || typeof label === 'number'
                    ? label
                    : undefined,
                )
              }
              contentStyle={{
                backdropFilter: 'blur(10px)',
                backgroundColor: 'var(--overlay-black-90)',
                border: '1px solid var(--overlay-white-10)',
                borderRadius: '12px',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              itemStyle={{ color: 'var(--overlay-white-20)' }}
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
        </ResponsiveContainer>
      </div>
    </div>
  );
}
