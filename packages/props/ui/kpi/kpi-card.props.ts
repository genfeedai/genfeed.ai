import type { CardSize, CardVariant } from '@genfeedai/contracts';
import type { AnalyticsQueryMetric } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { AnalyticsMetricVariant } from '@props/analytics/analytics-metric-definition.props';
import type { MetricCardTone } from '@props/cards/metric-card.props';
import type { ReactNode } from 'react';

export interface KPICardProps {
  analyticsMetric?: AnalyticsQueryMetric;
  analyticsMetricVariant?: AnalyticsMetricVariant;
  label: string;
  value: ReactNode;
  description?: string;
  icon?: IconComponent;
  tone?: MetricCardTone;
  trend?: number;
  trendLabel?: string;
  className?: string;
  variant?: CardVariant;
  size?: CardSize;
  /** Show loading state for value */
  isLoading?: boolean;
}
