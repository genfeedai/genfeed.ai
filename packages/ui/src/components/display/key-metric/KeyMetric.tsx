import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import type { ReactElement, ReactNode } from 'react';

export interface KeyMetricProps {
  className?: string;
  description?: ReactNode;
  label: string;
  /** @deprecated Inset surface tone is ignored — MetricCard owns framing. */
  tone?: string;
  value: ReactNode;
  valueClassName?: string;
}

/**
 * @deprecated Prefer {@link MetricCard} (`size="md"`).
 */
export default function KeyMetric({
  className,
  description,
  label,
  value,
  valueClassName,
}: KeyMetricProps): ReactElement {
  return (
    <MetricCard
      className={cn(className)}
      description={description}
      label={label}
      size="md"
      value={value}
      valueClassName={valueClassName}
    />
  );
}
