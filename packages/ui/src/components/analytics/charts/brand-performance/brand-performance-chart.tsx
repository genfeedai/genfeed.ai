'use client';

import { AnalyticsMetric, ButtonVariant } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatFullNumber,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { BrandPerformanceChartProps } from '@genfeedai/props/analytics/charts.props';
import Card from '@ui/card/Card';
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

const METRIC_COLORS = {
  engagement: 'var(--accent-rose)',
  posts: 'var(--overlay-white-20)',
  views: 'hsl(var(--foreground))',
};

const METRIC_LABELS = {
  engagement: 'Engagement',
  posts: 'Posts',
  views: 'Views',
};

export function BrandPerformanceChart({
  data,
  title = 'Top Brands Performance',
  metric = AnalyticsMetric.ENGAGEMENT,
  isLoading = false,
  height = 300,
  className = '',
}: BrandPerformanceChartProps) {
  type BrandMetricKey = keyof typeof METRIC_COLORS;
  const [activeMetric, setActiveMetric] = useState<BrandMetricKey>(
    String(metric).toLowerCase() as BrandMetricKey,
  );

  const isEmpty = !data || data.length === 0;

  // Sort and take top 10 brands by selected metric
  const sortedData = [...data]
    .sort((a, b) => b[activeMetric] - a[activeMetric])
    .slice(0, 10);

  // Truncate long brand names
  const formatBrandName = (name: string) => {
    return name.length > 15 ? `${name.substring(0, 15)}...` : name;
  };

  return (
    <Card className={className}>
      <div className="p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        {/* Metric Toggle Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(METRIC_LABELS) as BrandMetricKey[]).map((metricKey) => (
            <Button
              type="button"
              key={metricKey}
              onClick={() => setActiveMetric(metricKey)}
              isDisabled={isLoading || isEmpty}
              variant={ButtonVariant.UNSTYLED}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                activeMetric === metricKey
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'bg-transparent border-white/[0.08] text-white/50 hover:border-white/20 hover:text-white/80'
              } ${isLoading || isEmpty ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className="inline-block w-3 h-3 rounded-full mr-2"
                style={{ backgroundColor: METRIC_COLORS[metricKey] }}
              />

              {METRIC_LABELS[metricKey]}
            </Button>
          ))}
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
              No data available for the selected period
            </div>
          )}

          <ResponsiveContainer width="100%" height={height}>
            <BarChart
              data={sortedData}
              margin={{ bottom: 60, left: 20, right: 30, top: 5 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="var(--overlay-white-5)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={formatBrandName}
                stroke="var(--overlay-white-20)"
              />
              <YAxis
                tick={{ fill: 'var(--overlay-white-20)', fontSize: 12 }}
                tickFormatter={formatCompactNumberIntl}
                stroke="var(--overlay-white-20)"
              />
              <Tooltip
                formatter={(value) => [
                  formatFullNumber(
                    typeof value === 'number'
                      ? value
                      : typeof value === 'string'
                        ? Number(value)
                        : undefined,
                  ),
                  METRIC_LABELS[activeMetric],
                ]}
                contentStyle={{
                  backdropFilter: 'blur(10px)',
                  backgroundColor: 'var(--overlay-black-90)',
                  border: '1px solid var(--overlay-white-10)',
                  borderRadius: '12px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
                itemStyle={{ color: 'var(--overlay-white-20)' }}
              />
              <Bar
                dataKey={activeMetric as 'engagement' | 'posts' | 'views'}
                fill={METRIC_COLORS[activeMetric]}
                radius={[8, 8, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
