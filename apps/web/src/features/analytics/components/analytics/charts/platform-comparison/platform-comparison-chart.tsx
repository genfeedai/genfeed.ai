'use client';

import { AnalyticsMetric } from '@genfeedai/contracts';
import type { PlatformComparisonMetricType } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import {
  formatCompactNumberIntl,
  formatFullNumber,
} from '@genfeedai/helpers/formatting/format/format.helper';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import LoadingOverlay from '@ui/primitives/loading-overlay';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  chartAxisStroke,
  chartAxisTick,
  chartGridStroke,
  chartNeutralSeries,
  chartPlatformLabel,
} from '@/features/analytics/components/analytics/charts/chart-theme';
import type { PlatformComparisonChartProps } from '@/features/analytics/props/analytics.props';

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

const METRIC_COLORS = {
  comments: chartNeutralSeries[0],
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
  const selectionLabels = useTranslations('ui.selectionGroups');
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

  return (
    <div className={className}>
      <SegmentedControl
        appearance="chip"
        ariaLabel={selectionLabels('metrics')}
        className="mb-4"
        isDisabled={isLoading || isEmpty}
        onValueChange={(metrics) => {
          if (metrics.length > 0) {
            setActiveMetrics(metrics);
          }
        }}
        options={(
          Object.keys(METRIC_COLORS) as PlatformComparisonMetricType[]
        ).map((metric) => ({
          label: (
            <>
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: METRIC_COLORS[metric] }}
              />
              <span className="capitalize">{metric}</span>
            </>
          ),
          value: metric,
        }))}
        type="multiple"
        value={activeMetrics}
      />

      {/* Chart */}
      <div className="relative" style={{ height }}>
        {isLoading && <LoadingOverlay tone="veil" />}

        {isEmpty && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/50">
            No platform data available
          </div>
        )}

        {!isEmpty && (
          <ChartContainer
            config={chartConfig}
            className="h-full border-0 bg-transparent p-0 shadow-none"
            height="100%"
            style={{ minWidth: 0 }}
          >
            <BarChart
              data={data}
              margin={{ bottom: 5, left: 20, right: 30, top: 5 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke={chartGridStroke}
                vertical={false}
              />
              <XAxis
                dataKey="platform"
                tick={chartAxisTick}
                tickFormatter={chartPlatformLabel}
                stroke={chartAxisStroke}
              />
              <YAxis
                tick={chartAxisTick}
                tickFormatter={formatCompactNumberIntl}
                stroke={chartAxisStroke}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      chartPlatformLabel(String(label))
                    }
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
