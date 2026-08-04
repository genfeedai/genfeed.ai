import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';

export interface MetricItemProps {
  className?: string;
  label: string;
  value: ReactNode;
}

/**
 * Unframed label/value pair for dense tables and inline lists.
 * For framed tiles use {@link MetricCard}.
 * Type scale matches MetricCard label/value for consistency.
 */
export default function MetricItem({
  className,
  label,
  value,
}: MetricItemProps) {
  return (
    <div className={cn(className)}>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
