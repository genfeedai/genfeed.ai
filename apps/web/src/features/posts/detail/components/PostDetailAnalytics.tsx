'use client';

import type { AnalyticsStat } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { MetricCardGrid } from '@ui/cards/metric-card/MetricCardGrid';
import { EmptyStateCard } from '@ui/primitives/empty-state';

export interface PostDetailAnalyticsProps {
  stats: AnalyticsStat[];
  className?: string;
  variant?: 'grid' | 'inline';
  showEmptyState?: boolean;
  emptyStateLabel?: string;
}

/**
 * Shared analytics display component for post detail pages.
 * Used in both main content area and sidebar across all apps.
 */
export default function PostDetailAnalytics({
  stats,
  className,
  variant = 'grid',
  showEmptyState = true,
  emptyStateLabel = 'No analytics found',
}: PostDetailAnalyticsProps) {
  if (stats.length === 0) {
    if (!showEmptyState) {
      return null;
    }

    return <EmptyStateCard title={emptyStateLabel} className={className} />;
  }

  if (variant === 'inline') {
    return (
      <div className={cn('flex flex-wrap gap-4', className)}>
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-2 text-sm">
            <stat.icon className={cn('w-4 h-4', stat.accent)} />
            <span className="text-foreground/70">{stat.label}:</span>
            <span className="font-semibold">{stat.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <MetricCardGrid className={className} columns={3}>
      {stats.map((stat) => (
        <MetricCard
          key={stat.label}
          icon={stat.icon}
          iconClassName={stat.accent}
          label={stat.label}
          size="sm"
          value={stat.value}
        />
      ))}
    </MetricCardGrid>
  );
}
