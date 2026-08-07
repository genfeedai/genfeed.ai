import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StatsCardsProps } from '@genfeedai/props/ui/cards/stats-cards.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';

/**
 * @deprecated Prefer {@link MetricCardGrid} + {@link MetricCard} directly.
 * Kept as a thin adapter over the canonical metric tile so call sites stop
 * inventing icon-stat cards.
 */
export default function StatsCards({
  items,
  className,
  isLoading = false,
}: StatsCardsProps) {
  if (isLoading) {
    return (
      <MetricCardGrid className={cn('mb-6', className)} columns={4}>
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCard
            key={`loading-${index}`}
            isLoading
            label="Loading"
            value="0"
            size="sm"
          />
        ))}
      </MetricCardGrid>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  const columns = Math.min(Math.max(items.length, 2), 4) as 2 | 3 | 4;

  return (
    <MetricCardGrid className={cn('mb-6', className)} columns={columns}>
      {items.map((stat) => {
        const description =
          stat.description ||
          `${stat.count} ${
            stat.count === 1 && stat.singularLabel
              ? stat.singularLabel
              : stat.label.toLowerCase()
          }`;

        return (
          <MetricCard
            key={stat.label}
            className={stat.cardClassName}
            description={description}
            icon={stat.icon}
            iconClassName={stat.colorClass}
            label={stat.label}
            size="sm"
            value={String(stat.count)}
          />
        );
      })}
    </MetricCardGrid>
  );
}
