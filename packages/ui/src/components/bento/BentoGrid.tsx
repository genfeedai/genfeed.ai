'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { BentoGridProps } from '@genfeedai/props/ui/ui.props';
import { memo } from 'react';

const GAP_CLASSES = {
  lg: 'gap-6',
  md: 'gap-4',
  sm: 'gap-3',
} as const;

const COLUMNS_CLASSES = {
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
} as const;

const BentoGrid = memo(function BentoGrid({
  columns = 3,
  gap = 'md',
  className,
  children,
}: BentoGridProps) {
  return (
    <div
      className={cn(
        'grid',
        COLUMNS_CLASSES[columns],
        GAP_CLASSES[gap],
        className,
      )}
    >
      {children}
    </div>
  );
});

export default BentoGrid;
