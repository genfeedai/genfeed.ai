'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter';
import type { StatCardProps } from '@genfeedai/props/cards/stat-card.props';
import { Card, CardContent } from '@shipshitdev/ui';
import { Skeleton } from '@ui/primitives/skeleton';
import { memo } from 'react';
import { HiArrowTrendingDown, HiArrowTrendingUp } from 'react-icons/hi2';

const VARIANT_CLASSES = {
  black: 'ship-ui border-white/10 bg-black text-white',
  default: 'ship-ui border-border bg-secondary text-primary',
  white: 'ship-ui border-black/10 bg-white text-black',
} as const;

const SIZE_CLASSES = {
  lg: 'p-6',
  md: 'p-5',
  sm: 'p-4',
  xl: 'p-8',
} as const;

const VALUE_SIZE_CLASSES = {
  lg: 'text-4xl',
  md: 'text-3xl',
  sm: 'text-2xl',
  xl: 'text-5xl',
} as const;

const ICON_SIZE_CLASSES = {
  lg: 'h-12 w-12',
  md: 'h-10 w-10',
  sm: 'h-8 w-8',
  xl: 'h-14 w-14',
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

  const numericValue = match ? parseFloat(match[1]) : 0;
  const suffix = match ? match[2] || '' : '';
  // Determine decimal places from the original value
  const decimalMatch = match ? match[1].match(/\.(\d+)/) : null;
  const decimals = decimalMatch ? decimalMatch[1].length : 0;

  const { ref, value: animatedValue } = useAnimatedCounter({
    decimals,
    duration: 800,
    end: numericValue,
    suffix,
  });

  if (!match) {
    return <>{value}</>;
  }

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
        <Skeleton
          className={cn(
            'w-16 rounded-sm',
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
    <Card
      className={cn(
        'h-full overflow-hidden',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      <CardContent
        className={cn('flex h-full flex-col pt-5', SIZE_CLASSES[size])}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'font-semibold leading-none tracking-[-0.04em]',
              VALUE_SIZE_CLASSES[size],
              variant === 'white'
                ? 'text-black'
                : variant === 'black'
                  ? 'text-white'
                  : 'text-primary',
            )}
          >
            {renderValue()}
          </div>
          {Icon && (
            <div
              className={cn(
                'flex items-center justify-center rounded-md',
                variant === 'default' && 'bg-hover text-secondary',
                variant === 'white' && 'bg-black/5 text-black/60',
                variant === 'black' && 'bg-white/10 text-white/70',
                ICON_SIZE_CLASSES[size],
              )}
            >
              <Icon className="h-1/2 w-1/2" />
            </div>
          )}
        </div>

        <div
          className={cn(
            'mt-2 text-[11px] font-medium uppercase tracking-[0.18em]',
            variant === 'white'
              ? 'text-black/55'
              : variant === 'black'
                ? 'text-white/60'
                : 'text-muted',
          )}
        >
          {label}
        </div>

        {(description || hasTrend) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {description && (
              <span
                className={cn(
                  'text-[11px] leading-5',
                  variant === 'white'
                    ? 'text-black/60'
                    : variant === 'black'
                      ? 'text-white/65'
                      : 'text-secondary',
                )}
              >
                {description}
              </span>
            )}
            {hasTrend && !isLoading && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium',
                  isPositiveTrend && 'gen-trend-up',
                  isNegativeTrend && 'gen-trend-down',
                  !isPositiveTrend && !isNegativeTrend && 'gen-trend-neutral',
                )}
              >
                {isPositiveTrend && (
                  <HiArrowTrendingUp className="h-3.5 w-3.5" />
                )}
                {isNegativeTrend && (
                  <HiArrowTrendingDown className="h-3.5 w-3.5" />
                )}
                {isPositiveTrend ? '+' : ''}
                {trend}%
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

export default StatCard;
