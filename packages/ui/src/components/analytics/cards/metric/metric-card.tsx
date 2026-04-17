'use client';

import { TrendDirection } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import {
  formatCompactNumberIntl,
  formatPercentage,
} from '@genfeedai/helpers/formatting/format/format.helper';
import type { IconType } from 'react-icons';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiMinus,
} from 'react-icons/hi2';

const TREND_ICONS = {
  [TrendDirection.DOWN]: HiArrowTrendingDown,
  [TrendDirection.STABLE]: HiMinus,
  [TrendDirection.UP]: HiArrowTrendingUp,
} as const;

export interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: TrendDirection;
  icon?: IconType;
  iconColor?: string;
  isLoading?: boolean;
  className?: string;
  subtitle?: string;
  onClick?: () => void;
}

function formatValue(val: string | number): string {
  if (typeof val === 'number') {
    return formatCompactNumberIntl(val);
  }
  return val;
}

function getChangeColor(change: number | undefined): string {
  if (change === undefined || change === 0) {
    return 'text-muted-foreground';
  }
  return change > 0
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
}

const BASE_CARD_CLASSES =
  'w-full rounded-xl border border-border bg-card p-6 text-left';
const CLICKABLE_CLASSES =
  'cursor-pointer hover:shadow-lg hover:border-purple-300 dark:hover:border-purple-700 transition-all';

export function MetricCard({
  title,
  value,
  change,
  trend,
  icon: Icon,
  iconColor = 'text-purple-600',
  isLoading = false,
  className = '',
  subtitle,
  onClick,
}: MetricCardProps) {
  const cardClasses = cn(
    BASE_CARD_CLASSES,
    onClick && CLICKABLE_CLASSES,
    className,
  );

  const Component = onClick ? 'button' : 'div';

  if (isLoading) {
    return (
      <Component
        type={onClick ? 'button' : undefined}
        className={cardClasses}
        onClick={onClick}
      >
        <div className="animate-pulse">
          <div className="flex items-start justify-between mb-4">
            <div className="h-4 bg-muted w-24" />
            <div className="h-10 w-10 rounded-full bg-muted" />
          </div>
          <div className="h-8 bg-muted w-32 mb-2" />
          <div className="h-4 bg-muted w-20" />
        </div>
      </Component>
    );
  }

  const TrendIcon = trend ? TREND_ICONS[trend] : null;

  return (
    <Component
      type={onClick ? 'button' : undefined}
      className={cardClasses}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
        </div>
        {Icon && (
          <div className={cn('rounded-md bg-muted p-2', iconColor)}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="mb-2">
        <p className="text-3xl font-bold text-foreground">
          {formatValue(value)}
        </p>
      </div>

      {/* Change & Trend */}
      <div className="flex items-center gap-3">
        {change !== undefined && (
          <div
            className={cn(
              'flex items-center gap-2 text-sm font-medium',
              getChangeColor(change),
            )}
          >
            {TrendIcon && <TrendIcon className="w-4 h-4" />}
            <span>{formatPercentage(change)}</span>
          </div>
        )}
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </Component>
  );
}
