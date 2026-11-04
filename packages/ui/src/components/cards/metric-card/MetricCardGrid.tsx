import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactElement, ReactNode } from 'react';

export type MetricCardGridProps = {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4 | 5 | 6;
  'data-testid'?: string;
};

// Keep tiles at least 12rem wide, growing from one to six within their panel.
const TILE_COLUMNS = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 @[24rem]:grid-cols-2',
  3: 'grid-cols-1 @[24rem]:grid-cols-2 @[36rem]:grid-cols-3',
  4: 'grid-cols-1 @[24rem]:grid-cols-2 @[36rem]:grid-cols-3 @[48rem]:grid-cols-4',
  5: 'grid-cols-1 @[24rem]:grid-cols-2 @[36rem]:grid-cols-3 @[48rem]:grid-cols-4 @[60rem]:grid-cols-5',
  6: 'grid-cols-1 @[24rem]:grid-cols-2 @[36rem]:grid-cols-3 @[48rem]:grid-cols-4 @[60rem]:grid-cols-5 @[72rem]:grid-cols-6',
} as const;

export function MetricCardGrid({
  children,
  className,
  columns = 2,
  'data-testid': dataTestId = 'metric-card-grid',
}: MetricCardGridProps): ReactElement {
  return (
    <div className={cn('@container', className)} data-testid={dataTestId}>
      <div className={cn('grid gap-3', TILE_COLUMNS[columns])}>{children}</div>
    </div>
  );
}
