import type { CardSize, CardVariant } from '@genfeedai/enums';
import type { ComponentType, ReactNode } from 'react';

export interface KPICardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  valueClassName?: string;
  trend?: number;
  trendLabel?: string;
  className?: string;
  variant?: CardVariant;
  size?: CardSize;
  /** Show loading state for value */
  isLoading?: boolean;
}
