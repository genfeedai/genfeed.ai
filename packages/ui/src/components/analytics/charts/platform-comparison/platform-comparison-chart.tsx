'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import type { PlatformComparisonMetricType } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import {
  formatCompactNumberIntl,
  formatFullNumber,
} from '@helpers/formatting/format/format.helper';
import type { PlatformComparisonChartProps } from '@props/analytics/analytics.props';
import { Button } from '@ui/primitives/button';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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

  const isEmpty = !data || data.length === 0;

  const toggleMetric = (metric: PlatformComparisonMetricType) => {
    if (activeMetrics.includes(metric)) {
      if (activeMetrics.length > 1) {
        setActiveMetrics(activeMetrics.filter((m) => m !== metric));
      }
    } else {
      setActiveMetrics([...activeMetrics, metric]);
    }
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
                className="inline-block w-3 h-3 rounded-full mr-2"
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
            <span className="animate-pulse w-12 h-12 rounded-full bg-primary/30" />
          </div>
        )}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No platform data available
          </div>
        )}

        {!isEmpty && (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                formatter={(value, name) => [
                  formatFullNumber(
                    typeof value === 'number'
                      ? value
                      : typeof value === 'string'
                        ? Number(value)
                        : undefined,
                  ),
                  String(name ?? '')
                    ? String(name).charAt(0).toUpperCase() +
                      String(name).slice(1)
                    : '',
                ]}
                labelFormatter={(label) => getPlatformLabel(String(label))}
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
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
