import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MetricItemProps } from '@genfeedai/props/ui/display/metric-item.props';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';

/**
 * Unframed label/value pair for dense tables and inline lists.
 * For framed tiles use {@link MetricCard}.
 * Type scale matches MetricCard label/value for consistency.
 */
export default function MetricItem({
  analyticsMetric,
  className,
  label,
  value,
}: MetricItemProps) {
  return (
    <div className={cn(className)}>
      <p className="text-2xs font-bold uppercase tracking-[0.16em] text-foreground/35">
        {analyticsMetric ? (
          <AnalyticsMetricLabel metric={analyticsMetric}>
            {label}
          </AnalyticsMetricLabel>
        ) : (
          label
        )}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
