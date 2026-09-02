import { cn } from '@genfeedai/helpers';
import type { ReactNode } from 'react';

interface DashboardGridProps {
  cols?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}

const COLS_CLASSES = {
  2: 'grid-cols-1 xl:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4',
} as const;

export function DashboardGrid({
  cols = 4,
  className,
  children,
}: DashboardGridProps) {
  return (
    <div className={cn('grid gap-4', COLS_CLASSES[cols], className)}>
      {children}
    </div>
  );
}
