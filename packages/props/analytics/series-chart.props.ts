export interface SeriesChartSeries {
  /** CSS color, e.g. `hsl(var(--foreground))`. */
  color: string;
  /** Key of the value on each data point. */
  key: string;
  label: string;
}

export type SeriesChartDataPoint = { date: string } & Record<
  string,
  number | string
>;

export interface SeriesChartProps {
  ariaLabel: string;
  className?: string;
  data: readonly SeriesChartDataPoint[];
  emptyLabel: string;
  height?: number;
  isLoading?: boolean;
  series: readonly SeriesChartSeries[];
  /** Formats a value for the axis and the tooltip. */
  valueFormatter: (value: number) => string;
  /** `area` overlays the series; `stackedBar` adds them up per day. */
  variant: 'area' | 'stackedBar';
}
