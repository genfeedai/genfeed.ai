'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { CollectionCarouselSectionProps } from '@genfeedai/props/ui/collection/collection.props';
import CollectionSection from '@ui/collection/CollectionSection';
import { Button } from '@ui/primitives/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const GAP_CLASSES = {
  lg: 'gap-6',
  md: 'gap-4',
  sm: 'gap-3',
} as const;

const GAP_PIXELS = {
  lg: 24,
  md: 16,
  sm: 12,
} as const;

/**
 * Sub-pixel slack. Browsers report a scrolled-to-the-end rail as a fraction
 * short of its own maximum, so an exact comparison leaves the arrow enabled on
 * a rail that cannot move.
 */
const SCROLL_EPSILON = 2;

/** Fallback step for a rail whose first child cannot be measured. */
const FALLBACK_STEP = 300;

/**
 * A collection section whose items sit on a horizontally scrolling rail. The
 * arrows live in the section header, on the right of the title row, so they
 * never cover a card; a rail that fits its content shows none.
 */
export default function CollectionCarouselSection({
  gap = 'md',
  actions,
  children,
  ...sectionProps
}: CollectionCarouselSectionProps) {
  // Held in state, not a ref: the rail is absent while the section is loading
  // or errored, and the bounds effect must re-bind whenever it (re)mounts.
  const [rail, setRail] = useState<HTMLDivElement | null>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  useEffect(() => {
    if (!rail) return;

    const syncBounds = () => {
      const maxScroll = rail.scrollWidth - rail.clientWidth;

      setCanScrollBack(rail.scrollLeft > SCROLL_EPSILON);
      setCanScrollForward(rail.scrollLeft < maxScroll - SCROLL_EPSILON);
    };

    syncBounds();

    const observer = new ResizeObserver(syncBounds);
    observer.observe(rail);
    rail.addEventListener('scroll', syncBounds, { passive: true });

    return () => {
      observer.disconnect();
      rail.removeEventListener('scroll', syncBounds);
    };
  }, [rail]);

  /**
   * One card per press, measured rather than guessed: a fixed pixel step lands
   * mid-card on any rail whose items are not exactly that wide.
   */
  const scrollByCard = useCallback(
    (direction: 1 | -1) => {
      if (!rail) return;

      const card = rail.firstElementChild;
      const step = card
        ? card.getBoundingClientRect().width + GAP_PIXELS[gap]
        : FALLBACK_STEP;

      rail.scrollBy({ behavior: 'smooth', left: step * direction });
    },
    [gap, rail],
  );

  const hasOverflow = canScrollBack || canScrollForward;

  return (
    <CollectionSection
      {...sectionProps}
      actions={
        actions || hasOverflow ? (
          <>
            {actions}
            {hasOverflow ? (
              <div className="flex items-center gap-1">
                <Button
                  ariaLabel="Scroll left"
                  isDisabled={!canScrollBack}
                  onClick={() => scrollByCard(-1)}
                  size={ButtonSize.ICON}
                  type="button"
                  variant={ButtonVariant.GHOST}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  ariaLabel="Scroll right"
                  isDisabled={!canScrollForward}
                  onClick={() => scrollByCard(1)}
                  size={ButtonSize.ICON}
                  type="button"
                  variant={ButtonVariant.GHOST}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div
        className={cn(
          'flex overflow-x-auto scrollbar-hide scroll-smooth',
          'px-1 py-1', // Small padding to show focus outlines
          GAP_CLASSES[gap],
        )}
        ref={setRail}
      >
        {children}
      </div>
    </CollectionSection>
  );
}
