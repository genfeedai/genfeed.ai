'use client';

import { ButtonVariant, type TrendDirection } from '@genfeedai/contracts';
import type { IconType } from '@genfeedai/contracts/interfaces/ui/icon.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { formatCompactNumberIntl } from '@genfeedai/helpers/formatting/format/format.helper';
import MetricCardCanonical from '@ui/cards/metric-card/MetricCard';
import { Button } from '@ui/primitives/button';
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
  onClick,
  subtitle,
  title,
  value,
}: MetricCardProps): ReactElement {
  const card = (
    <MetricCardCanonical
      className={onClick ? undefined : className}
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

  if (!onClick) {
    return card;
  }

  return (
    <Button
      className={cn(
        'w-full text-left transition-all hover:shadow-border-strong',
        className,
      )}
      onClick={onClick}
      textTransform="none"
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      {card}
    </Button>
  );
}
