import type { MetricCardSize } from '@props/cards/metric-card.props';
import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import type { ReactNode } from 'react';

export interface KPISectionProps {
  title?: string;
  size?: MetricCardSize;
  items: KPICardProps[];
  isLoading?: boolean;
  error?: string | null;
  headerActions?: ReactNode;
  gridCols?: {
    mobile?: number;
    desktop?: number;
  };
  className?: string;
}
