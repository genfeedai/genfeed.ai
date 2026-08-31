'use client';

import type {
  ComponentProps,
  ComponentType,
  CSSProperties,
  ReactNode,
} from 'react';
import { createContext, useContext, useId, useMemo } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';

export type ChartSeriesConfig = {
  color?: string;
  icon?: ComponentType<{ className?: string }>;
  label?: ReactNode;
};

export type ChartConfig = Record<string, ChartSeriesConfig>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = createContext<ChartContextValue | null>(null);

function useChartContext() {
  const context = useContext(ChartContext);

  if (!context) {
    throw new Error('Chart components must be used inside <ChartContainer>.');
  }

  return context;
}

function slugifySeriesKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function chartColorVar(key: string) {
  return `var(--chart-${slugifySeriesKey(key)})`;
}

export type ChartContainerProps = ComponentProps<'div'> & {
  children: ReactNode;
  config: ChartConfig;
  height?: number | `${number}%`;
};

export function ChartContainer({
  config,
  children,
  className,
  style,
  height = 320,
  ...props
}: ChartContainerProps) {
  const chartId = useId().replace(/:/g, '');

  const chartStyle = useMemo(() => {
    const nextStyle: CSSProperties & Record<string, string | number> = {
      ...(style ?? {}),
    };

    for (const [key, series] of Object.entries(config)) {
      if (series.color) {
        nextStyle[`--chart-${slugifySeriesKey(key)}`] = series.color;
      }
    }

    return nextStyle;
  }, [config, style]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          'rounded-xl bg-secondary p-4 text-foreground shadow-dropdown',
          className,
        )}
        style={chartStyle}
        {...props}
      >
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

type ChartPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  payload?: Record<string, unknown>;
  value?: number | string | null;
};

function resolveSeriesKey(item: ChartPayloadItem) {
  const candidate = item.dataKey ?? item.name;
  return typeof candidate === 'string' ? candidate : undefined;
}

function resolvePayloadKey(item: ChartPayloadItem) {
  const seriesKey = resolveSeriesKey(item);

  if (seriesKey) {
    return `${seriesKey}-${String(item.value ?? '')}`;
  }

  if (item.name) {
    return `${String(item.name)}-${String(item.value ?? '')}`;
  }

  return JSON.stringify(item.payload ?? item.value ?? 'item');
}

function formatFallbackValue(value: ChartPayloadItem['value']) {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  if (typeof value === 'string') {
    return value;
  }

  return '—';
}

export type ChartTooltipContentProps = ComponentProps<'div'> & {
  active?: boolean;
  hideLabel?: boolean;
  label?: ReactNode;
  labelFormatter?: (label: ReactNode, payload: ChartPayloadItem[]) => ReactNode;
  payload?: ChartPayloadItem[];
  valueFormatter?: (
    value: ChartPayloadItem['value'],
    item: ChartPayloadItem,
  ) => ReactNode;
};

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  labelFormatter,
  valueFormatter,
  ...props
}: ChartTooltipContentProps) {
  const { config } = useChartContext();

  if (!(active && payload?.length)) {
    return null;
  }

  const resolvedLabel = labelFormatter ? labelFormatter(label, payload) : label;

  return (
    <div
      className={cn(
        'min-w-[180px] rounded-lg bg-elevated px-3 py-2 text-xs text-foreground shadow-dropdown',
        className,
      )}
      {...props}
    >
      {!hideLabel && resolvedLabel ? (
        <div className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
          {resolvedLabel}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {payload.map((item) => {
          const key = resolveSeriesKey(item) ?? resolvePayloadKey(item);
          const seriesKey = resolveSeriesKey(item);
          const series = seriesKey ? config[seriesKey] : undefined;
          const Icon = series?.icon;
          const color = series?.color ?? item.color ?? chartColorVar(key);
          const value = valueFormatter
            ? valueFormatter(item.value, item)
            : formatFallbackValue(item.value);

          return (
            <div
              key={resolvePayloadKey(item)}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                {Icon ? (
                  <Icon className="size-3.5 shrink-0 text-foreground" />
                ) : (
                  <span
                    className="size-2.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="truncate">
                  {series?.label ?? item.name ?? key}
                </span>
              </div>
              <span className="shrink-0 font-medium text-foreground">
                {value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type ChartLegendContentProps = ComponentProps<'div'> & {
  payload?: ChartPayloadItem[];
};

export function ChartLegendContent({
  payload,
  className,
  ...props
}: ChartLegendContentProps) {
  const { config } = useChartContext();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn('flex flex-wrap items-center gap-2 pt-3', className)}
      {...props}
    >
      {payload.map((item) => {
        const key = resolveSeriesKey(item) ?? resolvePayloadKey(item);
        const seriesKey = resolveSeriesKey(item);
        const series = seriesKey ? config[seriesKey] : undefined;
        const Icon = series?.icon;
        const color = series?.color ?? item.color ?? chartColorVar(key);

        return (
          <div
            key={resolvePayloadKey(item)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-hover px-2 py-1 text-[11px] text-muted-foreground"
          >
            {Icon ? (
              <Icon className="size-3.5 text-foreground" />
            ) : (
              <span
                className="size-2.5 rounded-full border border-border"
                style={{ backgroundColor: color }}
              />
            )}
            <span>{series?.label ?? item.name ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}
