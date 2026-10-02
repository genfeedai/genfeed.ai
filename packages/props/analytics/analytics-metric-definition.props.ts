import type { ReactNode } from 'react';

export interface AnalyticsMetricInfoProps {
  /** Canonical metric ID. Unsupported dynamic API IDs intentionally render nothing. */
  metric: string;
}

export interface AnalyticsMetricLabelProps extends AnalyticsMetricInfoProps {
  children: ReactNode;
}
