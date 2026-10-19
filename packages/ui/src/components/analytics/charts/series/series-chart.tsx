'use client';

import { formatChartDate } from '@genfeedai/helpers/formatting/format/format.helper';
import type { SeriesChartProps } from '@genfeedai/props/analytics/series-chart.props';
import { ChartContainer, ChartTooltipContent } from '@ui/charts';
import Spinner from '@ui/primitives/spinner';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';

const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), {
  ssr: false,
});
const Area = dynamic(() => import('recharts').then((m) => m.Area), {
  ssr: false,
});
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

const AXIS_TICK = { fill: 'hsl(var(--muted-foreground))' };

function toNumber(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A daily series chart for admin reports: overlaid areas or stacked bars over
 * any number of numeric series, with one value formatter for axis and tooltip.
 */
export function SeriesChart({
  ariaLabel,
  className,
  data,
  emptyLabel,
  height = 280,
  isLoading = false,
  series,
  valueFormatter,
  variant,
}: SeriesChartProps) {
  const config = useMemo(
    () =>
      Object.fromEntries(
        series.map((entry) => [
          entry.key,
          { color: entry.color, label: entry.label },
        ]),
      ),
    [series],
  );
  const hasSignal = useMemo(
    () =>
      data.some((point) =>
        series.some((entry) => toNumber(point[entry.key]) !== 0),
      ),
    [data, series],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (!hasSignal) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
      <XAxis
        dataKey="date"
        tick={AXIS_TICK}
        tickFormatter={formatChartDate}
        minTickGap={32}
      />
      <YAxis tick={AXIS_TICK} width={56} tickFormatter={valueFormatter} />
      <Tooltip
        content={
          <ChartTooltipContent
            labelFormatter={(label) =>
              typeof label === 'string' ? formatChartDate(label) : label
            }
            valueFormatter={(value) => valueFormatter(toNumber(value))}
          />
        }
      />
    </>
  );

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-4">
        {series.map((entry) => (
          <span
            key={entry.key}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            {entry.label}
          </span>
        ))}
      </div>
      <ChartContainer
        aria-label={ariaLabel}
        className="rounded-none border-0 bg-transparent p-0 shadow-none"
        config={config}
        height={height}
      >
        {variant === 'area' ? (
          <AreaChart data={[...data]}>
            {axes}
            {series.map((entry) => (
              <Area
                key={entry.key}
                dataKey={entry.key}
                fill={entry.color}
                fillOpacity={0.1}
                stroke={entry.color}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={[...data]}>
            {axes}
            {series.map((entry) => (
              <Bar
                key={entry.key}
                dataKey={entry.key}
                fill={entry.color}
                stackId="total"
              />
            ))}
          </BarChart>
        )}
      </ChartContainer>
    </div>
  );
}
