'use client';

import type { KPICardProps } from '@genfeedai/props/ui/kpi/kpi-card.props';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import type { ReactElement } from 'react';

/**
 * @deprecated Prefer {@link MetricCard} directly (`size="lg"`).
 * Thin alias so existing KPISection call sites keep working.
 */
export default function KPICard({
  className,
  description,
  icon,
  iconClassName,
  isLoading,
  label,
  trend,
  trendLabel,
  value,
  valueClassName,
}: KPICardProps): ReactElement {
  return (
    <MetricCard
      className={className}
      description={description}
      icon={icon}
      iconClassName={iconClassName}
      isLoading={isLoading}
      label={label}
      size="lg"
      trend={trend}
      trendLabel={trendLabel}
      value={value}
      valueClassName={valueClassName}
    />
  );
}
