'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAnimatedCounter } from '@genfeedai/hooks/ui/use-animated-counter/use-animated-counter';
import type {
  MetricCardAppearance,
  MetricCardProps,
  MetricCardSize,
  MetricSummaryItem,
  MetricSummaryProps,
} from '@genfeedai/props/cards/metric-card.props';
import Card from '@ui/card/Card';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { memo, type ReactElement, type ReactNode } from 'react';

const BODY_PADDING: Record<MetricCardSize, string> = {
  lg: 'p-5 sm:p-6',
  md: 'p-4',
  sm: 'p-3',
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
  'text-2xs font-bold uppercase tracking-[0.16em] text-foreground/35';

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
 * Canonical metric tile for the whole app.
 *
 * **One component, states via props** — do not invent StatCard / KPICard /
 * SummaryMetricCard / raw metric divs:
 * - `appearance="tile"` (default) — framed {@link Card}, label → value → detail
 * - `appearance="inline"` — frameless pair for {@link MetricSummary} strips
 * - `size` — sm / md / lg scale only
 * - `trend` — optional; omit to hide
 *
 * Surface frame is always {@link Card} (`rounded-card` + `shadow-border`).
 */
const MetricCard = memo(function MetricCard({
  appearance = 'tile',
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

  const valueNode = (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1',
        appearance === 'tile' ? 'mt-2' : undefined,
      )}
    >
      <p
        className={cn(
          VALUE_CLASS,
          appearance === 'inline' ? 'text-sm' : VALUE_SIZE[size],
          valueClassName,
        )}
      >
        {resolveValueContent(value, isLoading, size)}
      </p>

      {hasTrend && !isLoading ? (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
            isPositiveTrend && 'text-success',
            isNegativeTrend && 'text-destructive',
            !isPositiveTrend && !isNegativeTrend && 'text-foreground/45',
          )}
        >
          {TrendIcon ? <TrendIcon className="size-3.5" aria-hidden /> : null}
          {isPositiveTrend ? '+' : ''}
          {trend}%
          {trendLabel ? (
            <span className="font-normal text-foreground/40">{trendLabel}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );

  if (appearance === 'inline') {
    return (
      <span
        className={cn('inline-flex items-baseline gap-1.5', className)}
        data-testid="metric-card"
        data-appearance="inline"
      >
        <span className="font-medium text-foreground tabular-nums">
          {resolveValueContent(value, isLoading, 'sm')}
        </span>
        <span className="text-foreground/55">{label}</span>
      </span>
    );
  }

  return (
    <Card
      bodyClassName={cn('flex h-full flex-col gap-0', BODY_PADDING[size])}
      className={cn('h-full', className)}
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

      {valueNode}

      {description ? (
        <p className="mt-1.5 text-xs leading-5 text-foreground/55">
          {description}
        </p>
      ) : null}
    </Card>
  );
});

/**
 * Dense multi-metric strip: `3 accounts · 1 need attention · 2 healthy`.
 * Prefer this over nesting {@link MetricCardGrid} of tiny tiles inside a surface.
 */
export function MetricSummary({
  className,
  items,
  'data-testid': dataTestId = 'metric-summary',
}: MetricSummaryProps): ReactElement {
  return (
    <p
      className={cn('text-xs tabular-nums text-foreground/55', className)}
      data-testid={dataTestId}
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? (
            <span className="mx-1.5 text-foreground/25" aria-hidden>
              ·
            </span>
          ) : null}
          <MetricCard
            appearance="inline"
            label={item.label}
            value={item.value}
          />
        </span>
      ))}
    </p>
  );
}

export default MetricCard;
export type {
  MetricCardAppearance,
  MetricCardProps,
  MetricCardSize,
  MetricSummaryItem,
  MetricSummaryProps,
};
