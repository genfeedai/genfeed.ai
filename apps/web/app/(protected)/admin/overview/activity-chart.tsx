'use client';

import { CardEmptySize, ComponentSize } from '@genfeedai/contracts';
import { ChartContainer, ChartTooltipContent, chartColorVar } from '@ui/charts';
import { EmptyState } from '@ui/primitives/empty-state';
import { SegmentedControl } from '@ui/primitives/segmented-control';
import Spinner from '@ui/primitives/spinner';
import { useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type { ActivityChartProps } from '@/features/admin/props/dashboard.props';
import {
  chartAxisStroke,
  chartAxisTick,
  chartGridStroke,
} from '@/features/analytics/components/analytics/charts/chart-theme';

const SERIES_KEYS = ['views', 'likes'] as const;

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export default function ActivityChart({
  data,
  isLoading,
  onRangeChange,
  range,
}: ActivityChartProps) {
  const selectionLabels = useTranslations('ui.selectionGroups');
  const translate = useTranslations('common');
  const chartConfig = {
    likes: {
      color: 'var(--accent-rose)',
      label: translate('adminDashboard.activityChart.likes'),
    },
    views: {
      color: 'var(--foreground)',
      label: translate('adminDashboard.activityChart.views'),
    },
  };
  const hasData = data.length > 0;

  return (
    <WorkspaceSurface
      actions={
        <SegmentedControl
          ariaLabel={selectionLabels('activityRange')}
          onValueChange={onRangeChange}
          options={[
            {
              label: translate('adminDashboard.activityChart.range7'),
              value: '7d',
            },
            {
              label: translate('adminDashboard.activityChart.range30'),
              value: '30d',
            },
          ]}
          size="sm"
          value={range}
        />
      }
      data-testid="activity-chart"
      description={translate('adminDashboard.activityChart.description')}
      title={translate('adminDashboard.activityChart.title')}
      tone="muted"
    >
      <div className="h-chart-sm">
        {isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Spinner aria-hidden="true" size={ComponentSize.SM} />
            {translate('adminDashboard.activityChart.loading')}
          </div>
        ) : hasData ? (
          <ChartContainer
            className="border-0 bg-transparent p-0 shadow-none"
            config={chartConfig}
            height="100%"
          >
            <AreaChart
              accessibilityLayer
              data={data}
              margin={{ bottom: 0, left: 0, right: 10, top: 10 }}
            >
              <defs>
                {SERIES_KEYS.map((key) => (
                  <linearGradient
                    id={`activity-${key}`}
                    key={key}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={chartColorVar(key)}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={chartColorVar(key)}
                      stopOpacity={0}
                    />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={chartGridStroke} vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="date"
                minTickGap={24}
                stroke={chartAxisStroke}
                tick={chartAxisTick}
                tickFormatter={formatDate}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                stroke={chartAxisStroke}
                tick={chartAxisTick}
                tickFormatter={(value: number) =>
                  compactNumberFormatter.format(value)
                }
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => formatDate(String(label))}
                  />
                }
              />
              {SERIES_KEYS.map((key) => (
                <Area
                  dataKey={key}
                  fill={`url(#activity-${key})`}
                  key={key}
                  stroke={chartColorVar(key)}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </AreaChart>
          </ChartContainer>
        ) : (
          <EmptyState
            isFill
            size={CardEmptySize.SM}
            title={translate('adminDashboard.activityChart.empty')}
          />
        )}
      </div>
    </WorkspaceSurface>
  );
}
