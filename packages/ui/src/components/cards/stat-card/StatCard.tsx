'use client';

import type { MetricCardSize } from '@genfeedai/props/cards/metric-card.props';
import type { StatCardProps } from '@genfeedai/props/cards/stat-card.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import type { ReactElement } from 'react';

const SIZE_MAP: Record<NonNullable<StatCardProps['size']>, MetricCardSize> = {
  lg: 'lg',
  md: 'md',
  sm: 'sm',
  xl: 'lg',
};

/**
 * @deprecated Prefer {@link MetricCard}. Alias kept for existing imports.
 */
const StatCard = function StatCard({
  className,
  description,
  icon,
  isLoading,
  label,
  size = 'md',
  trend,
  value,
}: StatCardProps): ReactElement {
  return (
    <MetricCard
      className={className}
      description={description}
      icon={icon}
      isLoading={isLoading}
      label={label}
      size={SIZE_MAP[size]}
      trend={trend}
      value={value}
    />
  );
};

export default StatCard;
