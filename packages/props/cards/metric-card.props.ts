import type { ComponentType, ReactNode } from 'react';

export type MetricCardSize = 'sm' | 'md' | 'lg';

/**
 * How the metric paints:
 * - `tile` — framed Card (label → value → description). Default for grids.
 * - `inline` — frameless label/value pair for {@link MetricSummary} strips.
 */
export type MetricCardAppearance = 'tile' | 'inline';

export type MetricCardProps = {
  /**
   * Visual state. Prefer this over inventing a second metric component.
   * @default 'tile'
   */
  appearance?: MetricCardAppearance;
  /** Optional class on the outer frame */
  className?: string;
  /** Secondary line under the value (not a trend) */
  description?: ReactNode;
  /** Optional leading/trailing icon */
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  /** Show skeleton for the value */
  isLoading?: boolean;
  /** Uppercase metric label — same type scale on every size */
  label: string;
  /**
   * Compact (nested in surfaces), default, or hero dashboard row.
   * Typography stays the same family; only scale changes.
   */
  size?: MetricCardSize;
  /**
   * Percent change. Rendered only when `typeof trend === 'number'`.
   * Omit the prop to hide the trend entirely — same component either way.
   */
  trend?: number;
  /** Optional suffix next to the trend (e.g. "vs last week") */
  trendLabel?: string;
  /** Primary metric value */
  value: ReactNode;
  valueClassName?: string;
};

/** One entry in a dense multi-metric strip ({@link MetricSummary}). */
export type MetricSummaryItem = {
  label: string;
  value: ReactNode;
};

export type MetricSummaryProps = {
  className?: string;
  items: readonly MetricSummaryItem[];
  /** Optional test id (defaults to metric-summary). */
  'data-testid'?: string;
};
