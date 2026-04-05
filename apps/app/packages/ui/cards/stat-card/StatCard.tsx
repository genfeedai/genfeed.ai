'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@hooks/ui/use-animated-counter/use-animated-counter';
import type { StatCardProps } from '@props/cards/stat-card.props';
import { memo } from 'react';
import { HiArrowTrendingDown, HiArrowTrendingUp } from 'react-icons/hi2';

const VARIANT_CLASSES = {
  black: 'bg-black text-white',
  default: 'bg-card text-card-foreground',
  white: 'bg-white text-black',
} as const;

const SIZE_CLASSES = {
  lg: 'p-8',
  md: 'p-6',
  sm: 'p-4',
  xl: 'rounded-3xl p-10',
} as const;

const VALUE_SIZE_CLASSES = {
  lg: 'text-4xl',
  md: 'text-3xl',
  sm: 'text-2xl',
  xl: 'text-5xl',
} as const;

const ICON_SIZE_CLASSES = {
  lg: 'w-12 h-12',
  md: 'w-10 h-10',
  sm: 'w-8 h-8',
  xl: 'w-14 h-14',
} as const;

const LOADER_HEIGHT_CLASSES = {
  lg: 'h-10',
  md: 'h-8',
  sm: 'h-7',
  xl: 'h-12',
} as const;

interface AnimatedValueProps {
  value: string;
}

function AnimatedValue({ value }: AnimatedValueProps) {
  // Extract numeric part and suffix (e.g., "1.2K" -> 1.2, "K")
  const match = value.match(/^([\d.]+)(.*)$/);
  if (!match) {
    return <>{value}</>;
  }

  const numericValue = parseFloat(match[1]);
  const suffix = match[2] || '';
  // Determine decimal places from the original value
  const decimalMatch = match[1].match(/\.(\d+)/);
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

  const { ref, value: animatedValue } = useAnimatedCounter({
    decimals,
    duration: 800,
    end: numericValue,
    suffix,
  });

  return <span ref={ref}>{animatedValue}</span>;
}

/**
 * StatCard - A card component for displaying statistics
 * Supports default, white, and black variants with optional trend indicator
 */
const StatCard = memo(function StatCard({
  label,
  value,
  description,
  icon: Icon,
  variant = 'default',
  size = 'md',
  trend,
  className,
  isLoading = false,
}: StatCardProps) {
  const hasTrend = typeof trend === 'number';
  const isPositiveTrend = hasTrend && trend > 0;
  const isNegativeTrend = hasTrend && trend < 0;

  const renderValue = () => {
    if (isLoading) {
      return (
        <div
          className={cn(
            'w-16 animate-pulse',
            LOADER_HEIGHT_CLASSES[size],
            variant === 'white' ? 'bg-black/10' : 'bg-white/10',
          )}
        />
      );
    }

    // Animate if value is a string that looks like a formatted number
    if (typeof value === 'string' && /^[\d.]+[KMB]?$/.test(value)) {
      return <AnimatedValue value={value} />;
    }

    return value;
  };

  return (
    <div
      className={cn(
        'flex flex-col',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {/* Header with icon and label */}
      <div className="flex items-center justify-between mb-4">
        <span
          className={cn(
            'gen-label text-muted-foreground',
            variant === 'white' && 'text-black/50',
          )}
        >
          {label}
        </span>
        {Icon && (
          <div
            className={cn(
              'flex items-center justify-center',
              variant === 'default' && 'bg-white/5',
              variant === 'white' && 'bg-black/5',
              variant === 'black' && 'bg-white/10',
              ICON_SIZE_CLASSES[size],
            )}
          >
            <Icon
              className={cn(
                'w-1/2 h-1/2',
                variant === 'white' ? 'text-black/60' : 'text-muted-foreground',
              )}
            />
          </div>
        )}
      </div>

      {/* Value */}
      <div
        className={cn(
          'font-bold tracking-tight',
          VALUE_SIZE_CLASSES[size],
          variant === 'white' ? 'text-black' : 'text-foreground',
        )}
      >
        {renderValue()}
      </div>

      {/* Description and trend */}
      {(description || hasTrend) && (
        <div className="flex items-center gap-2 mt-2">
          {description && (
            <span
              className={cn(
                'text-sm',
                variant === 'white' ? 'text-black/50' : 'text-muted-foreground',
              )}
            >
              {description}
            </span>
          )}
          {hasTrend && !isLoading && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-sm font-medium',
                isPositiveTrend && 'gen-trend-up',
                isNegativeTrend && 'gen-trend-down',
                !isPositiveTrend && !isNegativeTrend && 'gen-trend-neutral',
              )}
            >
              {isPositiveTrend && <HiArrowTrendingUp className="w-4 h-4" />}
              {isNegativeTrend && <HiArrowTrendingDown className="w-4 h-4" />}
              {isPositiveTrend ? '+' : ''}
              {trend}%
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default StatCard;
