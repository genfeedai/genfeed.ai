import type { KPICardProps } from '@props/ui/kpi/kpi-card.props';
import type { ReactNode } from 'react';

export interface KPISectionProps {
  title?: string;
  items: KPICardProps[];
  isLoading?: boolean;
  error?: string | null;
  headerActions?: ReactNode;
  gridCols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
  };
  className?: string;
}
