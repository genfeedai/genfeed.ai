import type { ComponentType, ReactNode } from 'react';

export type MetricCardSize = 'sm' | 'md' | 'lg';

export type MetricCardProps = {
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
