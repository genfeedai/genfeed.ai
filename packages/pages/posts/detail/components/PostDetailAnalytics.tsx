'use client';

import type { AnalyticsStat } from '@cloud/interfaces/analytics/analytics-ui.interface';
import { cn } from '@helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';

export interface PostDetailAnalyticsProps {
  stats: AnalyticsStat[];
  className?: string;
  variant?: 'grid' | 'inline';
  showEmptyState?: boolean;
  emptyStateLabel?: string;
  emptyStateDescription?: string;
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
  emptyStateDescription = 'Analytics will appear once the post data is synced.',
}: PostDetailAnalyticsProps) {
  if (stats.length === 0) {
    if (!showEmptyState) {
      return null;
    }

    return (
      <CardEmpty
        label={emptyStateLabel}
        description={emptyStateDescription}
        className={className}
      />
    );
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
    <div className={cn('grid grid-cols-2 md:grid-cols-3 gap-4', className)}>
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <div className={cn('mb-2', stat.accent)}>
            <stat.icon size={16} />
          </div>
          <p className="text-sm text-foreground/70 mb-1">{stat.label}</p>
          <p className="text-2xl font-bold text-foreground">{stat.value}</p>
        </Card>
      ))}
    </div>
  );
}
