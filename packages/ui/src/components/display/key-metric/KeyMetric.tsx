import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import InsetSurface, {
  type InsetSurfaceProps,
} from '@ui/display/inset-surface/InsetSurface';
import MetricItem from '@ui/display/metric-item/MetricItem';
import type { ReactElement, ReactNode } from 'react';

export interface KeyMetricProps
  extends Omit<InsetSurfaceProps, 'children' | 'density'> {
  description?: ReactNode;
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

export default function KeyMetric({
  className,
  description,
  label,
  tone = 'contrast',
  value,
  valueClassName,
  ...props
}: KeyMetricProps): ReactElement {
  return (
    <InsetSurface
      {...props}
      className={className}
      density="comfortable"
      tone={tone}
    >
      <MetricItem
        className="space-y-0"
        label={label}
        value={
          <span
            className={cn(
              'mt-2 block text-3xl font-semibold text-foreground',
              valueClassName,
            )}
          >
            {value}
          </span>
        }
      />
      {description ? (
        <p className="mt-1 text-xs text-foreground/60">{description}</p>
      ) : null}
    </InsetSurface>
  );
}
