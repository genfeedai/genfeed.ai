'use client';

import type { ChartBlock, ChartSeriesConfig } from '@genfeedai/interfaces';
import { type ReactElement, useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const DEFAULT_COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

interface DynamicChartProps {
  block: ChartBlock;
}

type HydratableChartBlock = ChartBlock & {
  hydration?: {
    status?: 'idle' | 'loading' | 'ready';
  };
};

function inferSeriesKeys(
  data: Record<string, unknown>[],
  xAxis?: string,
): string[] {
  if (data.length === 0) return [];
  const excluded = new Set([xAxis ?? 'name', 'id', '_id']);
  return Object.keys(data[0]).filter(
    (key) => !excluded.has(key) && typeof data[0][key] === 'number',
  );
}

function getSeriesColor(index: number, series?: ChartSeriesConfig[]): string {
  return (
    series?.[index]?.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  );
}

function getSeriesLabel(key: string, series?: ChartSeriesConfig[]): string {
  const match = series?.find((s) => s.key === key);
  return match?.label ?? key;
}

function DynamicChart({ block }: DynamicChartProps): ReactElement {
  const hydratableBlock = block as HydratableChartBlock;
  const { chartType, data, xAxis, series, height, showLegend, showGrid } =
    block;
  const chartHeight = height ?? 300;
  const xKey = xAxis ?? 'name';
  const isLoading = hydratableBlock.hydration?.status === 'loading';

  const seriesKeys = useMemo(
    () => series?.map((s) => s.key) ?? inferSeriesKeys(data, xKey),
    [series, data, xKey],
  );

  if (isLoading) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-border bg-card/60"
        style={{ height: chartHeight }}
      >
        <div className="flex h-full items-end gap-3 px-6 py-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`chart-skeleton-${index}`}
              className="animate-pulse rounded-t-md bg-muted/70"
              style={{
                animationDelay: `${index * 80}ms`,
                height: `${35 + ((index % 4) + 1) * 14}%`,
                width: '100%',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height: chartHeight }}
      >
        No chart data available
      </div>
    );
  }

  if (chartType === 'pie') {
    const dataKey = seriesKeys[0] ?? 'value';
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <PieChart>
          <Pie
            data={data}
            dataKey={dataKey}
            nameKey={xKey}
            cx="50%"
            cy="50%"
            outerRadius={80}
            label
          >
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))',
            }}
          />
          {showLegend !== false && <Legend />}
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent =
    chartType === 'area'
      ? AreaChart
      : chartType === 'line'
        ? LineChart
        : BarChart;

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <ChartComponent data={data}>
        {showGrid !== false && (
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        )}
        <XAxis
          dataKey={xKey}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          stroke="hsl(var(--border))"
        />
        <YAxis
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
          stroke="hsl(var(--border))"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            color: 'hsl(var(--foreground))',
          }}
        />
        {showLegend !== false && <Legend />}
        {seriesKeys.map((key, index) => {
          const color = getSeriesColor(index, series);
          const label = getSeriesLabel(key, series);

          if (chartType === 'area') {
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                fill={color}
                fillOpacity={0.2}
              />
            );
          }
          if (chartType === 'line') {
            return (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={2}
                dot={false}
              />
            );
          }
          return <Bar key={key} dataKey={key} name={label} fill={color} />;
        })}
      </ChartComponent>
    </ResponsiveContainer>
  );
}

export default DynamicChart;
