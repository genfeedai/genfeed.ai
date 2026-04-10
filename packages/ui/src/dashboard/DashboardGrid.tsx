import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { DashboardGridProps } from '@genfeedai/props/ui/ui.props';

const COLS_CLASSES = {
  2: 'grid-cols-1 xl:grid-cols-2',
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
