'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HorizontalCarouselProps } from '@genfeedai/props/ui/ui.props';
import { Button } from '@ui/primitives/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

const GAP_CLASSES = {
  lg: 'gap-6',
  md: 'gap-4',
  sm: 'gap-3',
} as const;

/**
 * Sub-pixel slack. Browsers report a scrolled-to-the-end rail as a fraction
 * short of its own maximum, so an exact comparison leaves the arrow enabled on
 * a rail that cannot move.
 */
const SCROLL_EPSILON = 2;

/** Fallback step for a rail whose first child cannot be measured. */
const FALLBACK_STEP = 300;

const HorizontalCarousel = memo(function HorizontalCarousel({
  gap = 'md',
  showNavigation = true,
  className,
  itemClassName,
  children,
}: HorizontalCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  /**
   * Which arrows are live. A rail that fits its content needs neither, and an
   * arrow that does nothing when clicked is worse than an absent one — so the
   * pair is derived from the rail's own scroll position rather than assumed.
   */
  const syncBounds = useCallback(() => {
    const rail = scrollContainerRef.current;
    if (!rail) return;

    const maxScroll = rail.scrollWidth - rail.clientWidth;

    setCanScrollBack(rail.scrollLeft > SCROLL_EPSILON);
    setCanScrollForward(rail.scrollLeft < maxScroll - SCROLL_EPSILON);
  }, []);

  useEffect(() => {
    const rail = scrollContainerRef.current;
    if (!rail) return;

    syncBounds();

    const observer = new ResizeObserver(syncBounds);
    observer.observe(rail);
    rail.addEventListener('scroll', syncBounds, { passive: true });

    return () => {
      observer.disconnect();
      rail.removeEventListener('scroll', syncBounds);
    };
  }, [syncBounds]);

  /**
   * One card per press, measured rather than guessed: a fixed pixel step lands
   * mid-card on any rail whose items are not exactly that wide, which fights
   * scroll-snap instead of cooperating with it.
   */
  const scrollByCard = useCallback((direction: 1 | -1) => {
    const rail = scrollContainerRef.current;
    if (!rail) return;

    const card = rail.firstElementChild;
    const step = card ? card.getBoundingClientRect().width : FALLBACK_STEP;

    rail.scrollBy({ behavior: 'smooth', left: step * direction });
  }, []);

  const navigationClass = cn(
    'absolute top-1/2 z-10 -translate-y-1/2',
    'size-11 rounded-full',
    'bg-elevated/85 backdrop-blur-sm shadow-border',
    'flex items-center justify-center',
    'transition-opacity duration-300',
    'hover:bg-hover',
  );

  return (
    <div className={cn('relative group', className)}>
      {showNavigation && (
        <>
          <Button
            ariaLabel="Scroll left"
            className={cn(
              navigationClass,
              'left-3',
              canScrollBack ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={() => scrollByCard(-1)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            <ChevronLeft className="size-5" />
          </Button>

          <Button
            ariaLabel="Scroll right"
            className={cn(
              navigationClass,
              'right-3',
              canScrollForward
                ? 'opacity-100'
                : 'pointer-events-none opacity-0',
            )}
            onClick={() => scrollByCard(1)}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            <ChevronRight className="size-5" />
          </Button>
        </>
      )}

      <div
        className={cn(
          'flex overflow-x-auto scrollbar-hide scroll-smooth',
          'px-1 py-1', // Small padding to show focus outlines
          GAP_CLASSES[gap],
          itemClassName,
        )}
        ref={scrollContainerRef}
      >
        {children}
      </div>
    </div>
  );
});

export default HorizontalCarousel;
