import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface MetricItemProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/** A compact label + value pair for use in stat grids */
export default function MetricItem({
  className,
  label,
  value,
}: MetricItemProps) {
  return (
    <div className={cn(className)}>
      <p className="text-xs text-foreground/60">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
