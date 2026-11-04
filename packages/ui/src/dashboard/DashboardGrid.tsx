import { MetricCardGrid } from '@ui/dashboard/MetricCardGrid';
import type { ReactNode } from 'react';

interface DashboardGridProps {
  cols?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

export function DashboardGrid({
  cols = 4,
  className,
  children,
}: DashboardGridProps) {
  return (
    <MetricCardGrid columns={cols} className={className}>
      {children}
    </MetricCardGrid>
  );
}
