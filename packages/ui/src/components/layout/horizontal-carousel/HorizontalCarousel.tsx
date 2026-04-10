'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { HorizontalCarouselProps } from '@genfeedai/props/ui/ui.props';
import { Button } from '@ui/primitives/button';
import { memo, useCallback, useRef } from 'react';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';

const GAP_CLASSES = {
  lg: 'gap-6',
  md: 'gap-4',
  sm: 'gap-3',
} as const;

const SCROLL_AMOUNT = 300;

const HorizontalCarousel = memo(function HorizontalCarousel({
  gap = 'md',
  showNavigation = true,
  className,
  itemClassName,
  children,
}: HorizontalCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        behavior: 'smooth',
        left: -SCROLL_AMOUNT,
      });
    }
  }, []);

  const scrollRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        behavior: 'smooth',
        left: SCROLL_AMOUNT,
      });
    }
  }, []);

  return (
    <div className={cn('relative group', className)}>
      {showNavigation && (
        <>
          <Button
            type="button"
            onClick={scrollLeft}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'absolute left-0 top-1/2 -translate-y-1/2 z-10',
              'w-10 h-10 rounded-full',
              'bg-white/10 backdrop-blur-sm border border-white/20',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
              'hover:bg-white/20 hover:border-white/30',
              '-translate-x-1/2',
            )}
            ariaLabel="Scroll left"
          >
            <HiChevronLeft className="w-5 h-5" />
          </Button>

          <Button
            type="button"
            onClick={scrollRight}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              'absolute right-0 top-1/2 -translate-y-1/2 z-10',
              'w-10 h-10 rounded-full',
              'bg-white/10 backdrop-blur-sm border border-white/20',
              'flex items-center justify-center',
              'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
              'hover:bg-white/20 hover:border-white/30',
              'translate-x-1/2',
            )}
            ariaLabel="Scroll right"
          >
            <HiChevronRight className="w-5 h-5" />
          </Button>
        </>
      )}

      <div
        ref={scrollContainerRef}
        className={cn(
          'flex overflow-x-auto scrollbar-hide scroll-smooth',
          'px-1 py-1', // Small padding to show focus outlines
          GAP_CLASSES[gap],
          itemClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
});

export default HorizontalCarousel;
