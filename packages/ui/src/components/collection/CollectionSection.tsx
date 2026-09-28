import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionSectionProps } from '@genfeedai/props/ui/collection/collection.props';
import { useId } from 'react';

/**
 * One intent section of a collection page (Needs you, Recent, Discover, All).
 * A section with nothing to show renders nothing — no heading, no empty card —
 * so the page only ever lists what the viewer can act on.
 */
export default function CollectionSection({
  title,
  description,
  actions,
  itemCount,
  isCountVisible = false,
  isLoading = false,
  error,
  isHeaderSticky = false,
  className,
  children,
  'data-testid': dataTestId,
}: CollectionSectionProps) {
  const headingId = useId();

  if (itemCount === 0 && !isLoading && !error) {
    return null;
  }

  return (
    <section
      aria-busy={isLoading || undefined}
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-3', className)}
      data-testid={dataTestId}
    >
      <div
        className={cn(
          'flex flex-wrap items-end justify-between gap-3',
          isHeaderSticky && 'sticky top-0 z-10 bg-background py-2',
        )}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            className="flex items-baseline gap-2 text-sm font-semibold text-foreground"
            id={headingId}
          >
            <span className="truncate">{title}</span>
            {isCountVisible && itemCount !== undefined && itemCount > 0 ? (
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {itemCount}
              </span>
            ) : null}
          </h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>

      {error ? (
        <div
          className="rounded-card bg-card px-4 py-3 text-sm text-muted-foreground shadow-border"
          role="alert"
        >
          {error}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
