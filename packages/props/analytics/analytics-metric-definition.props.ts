import type { ReactNode } from 'react';

export type AnalyticsMetricVariant = 'perPost';

export interface AnalyticsMetricInfoProps {
  /** Canonical metric ID. Unsupported dynamic API IDs intentionally render nothing. */
  metric: string;
  variant?: AnalyticsMetricVariant;
}

export interface AnalyticsMetricLabelProps extends AnalyticsMetricInfoProps {
  children: ReactNode;
}
