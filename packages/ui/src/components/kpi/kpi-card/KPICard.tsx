'use client';

import { CardVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter';
import type { KPICardProps } from '@genfeedai/props/ui/kpi/kpi-card.props';
import Card from '@ui/card/Card';
import {
  HiOutlineArrowTrendingDown,
  HiOutlineArrowTrendingUp,
} from 'react-icons/hi2';

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

export default function KPICard({
  label,
  value,
  icon: Icon,
  iconClassName,
  description,
  valueClassName,
  trend,
  trendLabel,
  className,
  variant = CardVariant.DEFAULT,
  isLoading = false,
}: KPICardProps): React.ReactElement {
  const hasTrend = trend !== undefined && trend !== 0;
  const isPositiveTrend = trend !== undefined && trend > 0;
  const TrendIcon = isPositiveTrend
    ? HiOutlineArrowTrendingUp
    : HiOutlineArrowTrendingDown;

  let valueContent: React.ReactNode;
  if (isLoading) {
    valueContent = <div className="h-12 w-20 bg-white/10 animate-pulse" />;
  } else if (typeof value === 'string' && /^[\d.]+[KMB]?$/.test(value)) {
    valueContent = <AnimatedValue value={value} />;
  } else {
    valueContent = value;
  }

  return (
    <Card
      variant={variant}
      bodyClassName="h-full min-h-card justify-between gap-0"
      className={cn(className)}
    >
      <div className="flex items-start justify-between gap-3">
        {isLoading ? (
          <div className="h-8 w-16 animate-pulse bg-white/10" />
        ) : (
          <div
            className={cn(
              'text-2xl font-semibold tracking-[-0.02em] text-foreground',
              valueClassName,
            )}
          >
            {valueContent}
          </div>
        )}

        <div className="flex items-center gap-2">
          {Icon && (
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-md bg-white/5 text-foreground/55',
                iconClassName,
              )}
            >
              <Icon className="size-4" />
            </div>
          )}

          {hasTrend && !isLoading && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
                isPositiveTrend
                  ? 'bg-success/20 text-success'
                  : 'bg-destructive/20 text-destructive',
              )}
            >
              <TrendIcon className="size-3" />
              {Math.abs(trend)}%
              {trendLabel && <span className="ml-0.5">{trendLabel}</span>}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/55">
          {label}
        </div>
        {description ? (
          <p className="mt-1.5 text-[11px] text-foreground/45">{description}</p>
        ) : null}
      </div>
    </Card>
  );
}
