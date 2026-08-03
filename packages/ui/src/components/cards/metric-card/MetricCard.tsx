'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter';
import type {
  MetricCardProps,
  MetricCardSize,
} from '@genfeedai/props/cards/metric-card.props';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { memo, type ReactElement, type ReactNode } from 'react';

const FRAME_SIZE: Record<MetricCardSize, string> = {
  lg: 'rounded-card bg-card px-5 py-5 shadow-border sm:px-6 sm:py-6',
  md: 'rounded-card bg-background px-4 py-4 shadow-border',
  sm: 'rounded-card bg-background px-4 py-3 shadow-border',
};

const VALUE_SIZE: Record<MetricCardSize, string> = {
  lg: 'text-4xl sm:text-5xl',
  md: 'text-3xl',
  sm: 'text-2xl',
};

const VALUE_SKELETON: Record<MetricCardSize, string> = {
  lg: 'h-12 w-24',
  md: 'h-9 w-16',
  sm: 'h-7 w-12',
};

const LABEL_CLASS =
  'text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35';

const VALUE_CLASS =
  'font-semibold tracking-[-0.03em] tabular-nums text-foreground';

function AnimatedValue({ value }: { value: string }): ReactElement {
  const match = value.match(/^([\d.]+)(.*)$/);
  const numericValue = match ? Number.parseFloat(match[1]) : 0;
  const suffix = match ? match[2] || '' : '';
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

function resolveValueContent(
  value: ReactNode,
  isLoading: boolean,
  size: MetricCardSize,
): ReactNode {
  if (isLoading) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-block animate-pulse rounded-sm bg-muted',
          VALUE_SKELETON[size],
        )}
      />
    );
  }

  if (typeof value === 'string' && /^[\d.]+[KMB]?$/.test(value)) {
    return <AnimatedValue value={value} />;
  }

  return value;
}

/**
 * Single metric tile for the whole app.
 *
 * - Label + value type is fixed (size only scales the value).
 * - `trend` is optional: pass a number to show it, omit to hide — same component.
 * - `icon` is optional decoration, never required for a valid tile.
 */
const MetricCard = memo(function MetricCard({
  className,
  description,
  icon: Icon,
  iconClassName,
  isLoading = false,
  label,
  size = 'md',
  trend,
  trendLabel,
  value,
  valueClassName,
}: MetricCardProps): ReactElement {
  const hasTrend = typeof trend === 'number';
  const isPositiveTrend = hasTrend && trend > 0;
  const isNegativeTrend = hasTrend && trend < 0;
  const TrendIcon = isPositiveTrend
    ? TrendingUp
    : isNegativeTrend
      ? TrendingDown
      : null;

  return (
    <div
      className={cn('flex h-full flex-col', FRAME_SIZE[size], className)}
      data-testid="metric-card"
    >
      <div className="flex items-start justify-between gap-3">
        <p className={LABEL_CLASS}>{label}</p>
        {Icon ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/50',
              size === 'lg' && 'size-10',
              iconClassName,
            )}
          >
            <Icon className={size === 'lg' ? 'size-5' : 'size-4'} />
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className={cn(VALUE_CLASS, VALUE_SIZE[size], valueClassName)}>
          {resolveValueContent(value, isLoading, size)}
        </p>

        {hasTrend && !isLoading ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium',
              isPositiveTrend && 'text-success',
              isNegativeTrend && 'text-destructive',
              !isPositiveTrend && !isNegativeTrend && 'text-foreground/45',
            )}
          >
            {TrendIcon ? <TrendIcon className="size-3.5" aria-hidden /> : null}
            {isPositiveTrend ? '+' : ''}
            {trend}%
            {trendLabel ? (
              <span className="font-normal text-foreground/40">
                {trendLabel}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {description ? (
        <p className="mt-1.5 text-xs leading-5 text-foreground/55">
          {description}
        </p>
      ) : null}
    </div>
  );
});

export default MetricCard;
export type { MetricCardProps, MetricCardSize };
