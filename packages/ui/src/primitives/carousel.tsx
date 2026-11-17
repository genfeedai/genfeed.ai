'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers';
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  type KeyboardEvent,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { Button } from './button';

type CarouselApi = UseEmblaCarouselType[1];
type CarouselOptions = NonNullable<Parameters<typeof useEmblaCarousel>[0]>;

interface CarouselContextValue {
  api: CarouselApi;
  canScrollNext: boolean;
  canScrollPrev: boolean;
  orientation: 'horizontal' | 'vertical';
  scrollNext: () => void;
  scrollPrev: () => void;
  scrollSnapCount: number;
  selectedIndex: number;
  viewportRef: UseEmblaCarouselType[0];
}

const CarouselContext = createContext<CarouselContextValue | null>(null);

function useCarousel(): CarouselContextValue {
  const context = useContext(CarouselContext);
  if (!context) {
    throw new Error('Carousel parts must be used inside <Carousel>');
  }
  return context;
}

interface CarouselPosition {
  canScrollNext: boolean;
  canScrollPrev: boolean;
  scrollSnapCount: number;
  selectedIndex: number;
}

const EMPTY_POSITION = JSON.stringify({
  canScrollNext: false,
  canScrollPrev: false,
  scrollSnapCount: 0,
  selectedIndex: 0,
} satisfies CarouselPosition);

/** Embla's position as one string, so the snapshot is stable between changes. */
function readPosition(api: CarouselApi): string {
  if (!api) {
    return EMPTY_POSITION;
  }
  return JSON.stringify({
    canScrollNext: api.canScrollNext(),
    canScrollPrev: api.canScrollPrev(),
    scrollSnapCount: api.scrollSnapList().length,
    selectedIndex: api.selectedScrollSnap(),
  } satisfies CarouselPosition);
}

interface CarouselProps extends ComponentProps<'section'> {
  /** Names the carousel for assistive technology. */
  label: string;
  opts?: CarouselOptions;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * A swipeable carousel (shadcn/ui Carousel on Embla): drag or swipe on touch,
 * arrow keys on focus, and Previous/Next buttons when they are rendered.
 */
function Carousel({
  children,
  className,
  label,
  opts,
  orientation = 'horizontal',
  ...props
}: CarouselProps) {
  const [viewportRef, api] = useEmblaCarousel({
    ...opts,
    axis: orientation === 'horizontal' ? 'x' : 'y',
  });

  const subscribe = useCallback(
    (onChange: () => void) => {
      api?.on('select', onChange);
      api?.on('reInit', onChange);
      return () => {
        api?.off('select', onChange);
        api?.off('reInit', onChange);
      };
    },
    [api],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readPosition(api),
    () => EMPTY_POSITION,
  );
  const position = useMemo(
    () => JSON.parse(snapshot) as CarouselPosition,
    [snapshot],
  );

  const scrollPrev = useCallback(() => api?.scrollPrev(), [api]);
  const scrollNext = useCallback(() => api?.scrollNext(), [api]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollPrev();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollNext();
    }
  }

  return (
    <CarouselContext.Provider
      value={{
        api,
        ...position,
        orientation,
        scrollNext,
        scrollPrev,
        viewportRef,
      }}
    >
      <section
        aria-label={label}
        aria-roledescription="carousel"
        className={cn('relative', className)}
        onKeyDownCapture={handleKeyDown}
        {...props}
      >
        {children}
      </section>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: ComponentProps<'ul'>) {
  const { orientation, viewportRef } = useCarousel();
  return (
    <div className="overflow-hidden" ref={viewportRef}>
      <ul
        className={cn(
          'flex',
          orientation === 'horizontal' ? '-ml-2' : '-mt-2 flex-col',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, ...props }: ComponentProps<'li'>) {
  const { orientation } = useCarousel();
  return (
    <li
      aria-roledescription="slide"
      className={cn(
        'min-w-0 shrink-0 grow-0 basis-full',
        orientation === 'horizontal' ? 'pl-2' : 'pt-2',
        className,
      )}
      {...props}
    />
  );
}

function CarouselPrevious({
  className,
  label,
  ...props
}: Omit<ComponentProps<typeof Button>, 'ariaLabel' | 'onClick'> & {
  /** Accessible name of the button, in the reader's language. */
  label: string;
}) {
  const { canScrollPrev, scrollPrev } = useCarousel();
  return (
    <Button
      ariaLabel={label}
      className={cn(
        'absolute left-2 top-1/2 -translate-y-1/2 rounded-full',
        className,
      )}
      isDisabled={!canScrollPrev}
      onClick={scrollPrev}
      size={ButtonSize.ICON}
      type="button"
      variant={ButtonVariant.OVERLAY}
      withWrapper={false}
      {...props}
    >
      <ChevronLeft aria-hidden="true" className="size-4" />
    </Button>
  );
}

function CarouselNext({
  className,
  label,
  ...props
}: Omit<ComponentProps<typeof Button>, 'ariaLabel' | 'onClick'> & {
  /** Accessible name of the button, in the reader's language. */
  label: string;
}) {
  const { canScrollNext, scrollNext } = useCarousel();
  return (
    <Button
      ariaLabel={label}
      className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 rounded-full',
        className,
      )}
      isDisabled={!canScrollNext}
      onClick={scrollNext}
      size={ButtonSize.ICON}
      type="button"
      variant={ButtonVariant.OVERLAY}
      withWrapper={false}
      {...props}
    >
      <ChevronRight aria-hidden="true" className="size-4" />
    </Button>
  );
}

/** "2 / 5" over the slides, for a reader who cannot see the dots. */
function CarouselCounter({ className, ...props }: ComponentProps<'p'>) {
  const { scrollSnapCount, selectedIndex } = useCarousel();
  if (scrollSnapCount < 2) {
    return null;
  }
  return (
    <p
      aria-live="polite"
      className={cn(
        'rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white', // design-system-allow-content-color -- sits on media
        className,
      )}
      {...props}
    >
      {selectedIndex + 1} / {scrollSnapCount}
    </p>
  );
}

export {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselCounter,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
};
