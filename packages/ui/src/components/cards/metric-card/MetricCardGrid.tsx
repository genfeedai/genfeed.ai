import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactElement, ReactNode } from 'react';

export type MetricCardGridProps = {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3 | 4 | 6;
};

export function MetricCardGrid({
  children,
  className,
  columns = 2,
}: MetricCardGridProps): ReactElement {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        columns === 6 && 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
        className,
      )}
      data-testid="metric-card-grid"
    >
      {children}
    </div>
  );
}
