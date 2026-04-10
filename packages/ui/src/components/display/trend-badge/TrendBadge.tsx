'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { TrendBadgeProps } from '@genfeedai/props/ui/display/trend-badge.props';
import { memo } from 'react';
import {
  HiArrowTrendingDown,
  HiArrowTrendingUp,
  HiMinus,
} from 'react-icons/hi2';

const SIZE_CLASSES = {
  lg: 'text-base px-2.5 py-1.5',
  md: 'text-sm px-2 py-1',
  sm: 'text-xs px-1.5 py-0.5',
} as const;

const ICON_SIZE_CLASSES = {
  lg: 'w-5 h-5',
  md: 'w-4 h-4',
  sm: 'w-3 h-3',
} as const;

/**
 * TrendBadge - Displays a trend value with directional styling
 * Positive values show green/up, negative show red/down, zero shows neutral
 */
const TrendBadge = memo(function TrendBadge({
  value,
  label,
  showIcon = true,
  size = 'md',
  className,
}: TrendBadgeProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  const _isNeutral = value === 0;

  const trendClass = isPositive
    ? 'gen-trend-up'
    : isNegative
      ? 'gen-trend-down'
      : 'gen-trend-neutral';

  const formattedValue = isPositive ? `+${value}%` : `${value}%`;

  const TrendIcon = isPositive
    ? HiArrowTrendingUp
    : isNegative
      ? HiArrowTrendingDown
      : HiMinus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        SIZE_CLASSES[size],
        trendClass,
        className,
      )}
    >
      {showIcon && <TrendIcon className={ICON_SIZE_CLASSES[size]} />}
      <span>{formattedValue}</span>
      {label && (
        <span className="text-muted-foreground font-normal">{label}</span>
      )}
    </span>
  );
});

export default TrendBadge;
