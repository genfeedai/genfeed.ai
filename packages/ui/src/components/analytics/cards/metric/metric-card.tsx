'use client';

import type { TrendDirection } from '@genfeedai/enums';
import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import type { IconType } from '@genfeedai/interfaces/ui/icon.interface';
import MetricCardCanonical from '@ui/cards/metric-card/MetricCard';
import type { ReactElement } from 'react';

export interface MetricCardProps {
  change?: number;
  className?: string;
  icon?: IconType;
  iconColor?: string;
  isLoading?: boolean;
  onClick?: () => void;
  subtitle?: string;
  title: string;
  trend?: TrendDirection;
  value: string | number;
}

function formatValue(val: string | number): string {
  if (typeof val === 'number') {
    return formatCompactNumberIntl(val);
  }
  return val;
}

/**
 * @deprecated Prefer `@ui/cards/metric-card/MetricCard`.
 * Analytics alias — maps title/change API onto the shared MetricCard.
 */
export function MetricCard({
  change,
  className = '',
  icon,
  iconColor,
  isLoading = false,
  subtitle,
  title,
  value,
}: MetricCardProps): ReactElement {
  return (
    <MetricCardCanonical
      className={className}
      description={subtitle}
      icon={icon}
      iconClassName={iconColor}
      isLoading={isLoading}
      label={title}
      size="md"
      trend={change}
      value={formatValue(value)}
    />
  );
}
