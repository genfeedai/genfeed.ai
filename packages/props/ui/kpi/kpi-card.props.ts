import type { CardSize, CardVariant } from '@genfeedai/contracts';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface KPICardProps {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: IconComponent;
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
