import type { RowSidebarStatsProps } from '@genfeedai/props/ui/display/row-sidebar-blocks.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';

/** Two-column grid of headline numbers for a row's right sidebar. */
export default function RowSidebarStats({
  isLoading = false,
  stats,
}: RowSidebarStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map((stat) => (
        <MetricCard
          key={stat.id}
          appearance="inset"
          isLoading={isLoading}
          label={stat.label}
          size="xs"
          trend={stat.trend}
          trendLabel={stat.trendLabel}
          value={stat.value}
        />
      ))}
    </div>
  );
}
