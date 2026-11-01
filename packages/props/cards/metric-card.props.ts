import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { AnalyticsMetricVariant } from '@props/analytics/analytics-metric-definition.props';
import type { ReactNode } from 'react';

export type MetricCardSize = 'xs' | 'sm' | 'md' | 'lg';

export type MetricCardAlign = 'start' | 'center';

/**
 * How the metric paints:
 * - `tile` — framed Card (label → value → description). Default for grids.
 * - `inline` — frameless label/value pair for {@link MetricSummary} strips.
 * - `plain` — frameless label-above-value block for a surface that already
 *   owns the frame (a Card, panel or grid).
 */
export type MetricCardAppearance = 'tile' | 'inline' | 'plain';

export type MetricCardProps = {
  /**
   * Horizontal alignment of label, value and description.
   * @default 'start'
   */
  align?: MetricCardAlign;
  analyticsMetric?: AnalyticsQueryMetric;
  analyticsMetricVariant?: AnalyticsMetricVariant;
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
  icon?: IconComponent;
  iconClassName?: string;
  /**
   * Plain appearance only: show the label under the value (a caption) while
   * the DOM keeps label first.
   */
  isLabelBelow?: boolean;
  /**
   * Render label and value as `<dt>`/`<dd>` (plain appearance only). The
   * parent must be a `<dl>`.
   */
  isDefinition?: boolean;
  /** Show one skeleton inside the tile while its data is loading. */
  isLoading?: boolean;
  /** Uppercase metric label — same type scale on every size */
  label: string;
  /**
   * Dense (xs), compact (nested in surfaces), default, or hero dashboard row.
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
