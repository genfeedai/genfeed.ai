import { cn } from '@genfeedai/helpers/formatting/cn';
import type { ReactNode } from 'react';
import { Skeleton } from '../components/display/skeleton/skeleton';
import { DashboardGrid } from './DashboardGrid';

export interface SurfaceSummaryItem {
  /** Secondary line under the value — context, not a second metric. */
  accent?: ReactNode;
  icon?: ReactNode;
  isLoading?: boolean;
  label: string;
  /** Extra card classes for per-item emphasis (e.g. a warning tint). */
  tone?: string;
  value: string;
}

/**
 * Inline strips render *inside* the agent conversation thread, where a surface
 * gets one row and a deep link — never its whole UI. The cap is enforced here
 * rather than by review so no call site can widen it by accident.
 */
const INLINE_ITEM_LIMIT = 3;
const PAGE_ITEM_LIMIT = 4;

const DENSITY = {
  comfortable: {
    accent: 'text-sm leading-6 text-foreground/55',
    body: 'flex h-full flex-col justify-between gap-6 p-5',
    card: 'min-h-[136px]',
    label:
      'text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/35',
    value: 'text-3xl font-semibold tracking-[-0.04em] text-foreground',
  },
  compact: {
    accent: 'text-[11px] text-foreground/45',
    body: 'p-4',
    card: '',
    label:
      'text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/55',
    value: 'text-2xl font-semibold tracking-[-0.02em] text-foreground',
  },
} as const;

interface SurfaceSummaryStripProps {
  className?: string;
  density?: keyof typeof DENSITY;
  items: readonly SurfaceSummaryItem[];
  testId?: string;
  /**
   * `page` is a standalone SaaS surface (up to four metrics). `inline` is the
   * capped row a surface is allowed to project into the agent conversation.
   */
  variant?: 'inline' | 'page';
}

/**
 * The one summary-metric row for every surface. Replaces the four
 * near-identical local strips that had drifted apart (workspace, overview,
 * campaigns, desktop mission control).
 */
export function SurfaceSummaryStrip({
  className,
  density = 'compact',
  items,
  testId,
  variant = 'page',
}: SurfaceSummaryStripProps) {
  const limit = variant === 'inline' ? INLINE_ITEM_LIMIT : PAGE_ITEM_LIMIT;
  const visibleItems = items.slice(0, limit);
  const styles = DENSITY[density];

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <section className={className} data-testid={testId}>
      <DashboardGrid cols={visibleItems.length >= 4 ? 4 : 3}>
        {visibleItems.map((item) => (
          <div
            key={item.label}
            className={cn(
              'rounded-card bg-card shadow-border',
              styles.card,
              styles.body,
              item.tone,
            )}
          >
            <div className="flex items-start justify-between gap-3">
              {item.isLoading ? (
                <Skeleton variant="text" height={32} className="w-16" />
              ) : (
                <div className={styles.value}>{item.value}</div>
              )}
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
            </div>
            <p className={cn('mt-1', styles.label)}>{item.label}</p>
            {item.isLoading ? (
              <Skeleton variant="text" height={12} className="mt-2 w-28" />
            ) : item.accent ? (
              <p className={cn('mt-1.5', styles.accent)}>{item.accent}</p>
            ) : null}
          </div>
        ))}
      </DashboardGrid>
    </section>
  );
}

export default SurfaceSummaryStrip;
