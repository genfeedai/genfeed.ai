import type { MetricCardProps } from '@genfeedai/props/cards/metric-card.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import {
  MetricCardGrid,
  type MetricCardGridProps,
} from '@ui/cards/metric-card/MetricCardGrid';
import type { ReactElement } from 'react';

export type OverviewMetricProps = Omit<MetricCardProps, 'size'>;

/**
 * Nested metric tile (sm). Same component as {@link MetricCard} — optional
 * `trend` is shown only when provided.
 */
export function OverviewMetric(props: OverviewMetricProps): ReactElement {
  return <MetricCard {...props} size="sm" />;
}

export type OverviewMetricGridProps = MetricCardGridProps;

/** @deprecated Prefer {@link MetricCardGrid} */
export function OverviewMetricGrid(
  props: OverviewMetricGridProps,
): ReactElement {
  return <MetricCardGrid {...props} />;
}
