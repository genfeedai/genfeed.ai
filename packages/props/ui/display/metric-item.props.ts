import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface MetricItemProps {
  analyticsMetric?: AnalyticsQueryMetric;
  className?: string;
  label: string;
  value: ReactNode;
}
