import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { AnalyticsMetricVariant } from '@props/analytics/analytics-metric-definition.props';
import type { ReactNode } from 'react';

export type MetricCardSize = 'xs' | 'sm' | 'md' | 'lg';

/** Horizontal alignment of the value and label inside the tile. */
export type MetricCardAlign = 'start' | 'center';

/**
 * How the metric paints:
 * - `tile` — framed Card (value → label → description). Default for grids.
 * - `inset` — the same tile as a borderless recessed panel, for metrics that
 *   sit inside another card.
 * - `inline` — frameless value/label pair for {@link MetricSummary} strips.
 */
export type MetricCardAppearance = 'tile' | 'inset' | 'inline';

/**
 * State colour of the value and the icon chip. Owned by the primitive: call
 * sites pick a tone, never a colour class.
 */
export type MetricCardTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'accent'
  | 'muted';

export type MetricCardProps = {
  analyticsMetric?: AnalyticsQueryMetric;
  analyticsMetricVariant?: AnalyticsMetricVariant;
  /**
   * Align the value and label to the start or the centre of the tile.
   * @default 'start'
   */
  align?: MetricCardAlign;
  /**
   * Visual state. Prefer this over inventing a second metric component.
   * @default 'tile'
   */
  appearance?: MetricCardAppearance;
  /** Optional class on the outer frame */
  className?: string;
  /** Secondary line under the value (not a trend) */
  description?: ReactNode;
  /** Optional icon chip, top right of the tile */
  icon?: IconComponent;
  /** Show one skeleton inside the tile while its data is loading. */
  isLoading?: boolean;
  /** Uppercase metric label under the value — same type scale on every size */
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
  /**
   * State colour of the value and icon chip.
   * @default 'default'
   */
  tone?: MetricCardTone;
  /** Primary metric value, rendered first and largest */
  value: ReactNode;
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
