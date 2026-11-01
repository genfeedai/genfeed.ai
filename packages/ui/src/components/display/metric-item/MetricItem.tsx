import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { MetricItemProps } from '@genfeedai/props/ui/display/metric-item.props';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';

/**
 * Unframed value/label pair for dense tables and inline lists: the value
 * first, the label under it, like {@link MetricCard}.
 * For framed tiles use {@link MetricCard}.
 */
export default function MetricItem({
  analyticsMetric,
  className,
  label,
  value,
}: MetricItemProps) {
  return (
    <div className={cn(className)}>
      <p className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 text-2xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {analyticsMetric ? (
          <AnalyticsMetricLabel metric={analyticsMetric}>
            {label}
          </AnalyticsMetricLabel>
        ) : (
          label
        )}
      </p>
    </div>
  );
}
