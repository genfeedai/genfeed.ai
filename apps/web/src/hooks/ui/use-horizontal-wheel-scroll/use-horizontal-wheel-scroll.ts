'use client';

import { type RefObject, useEffect, useRef } from 'react';

/** Firefox reports wheel deltas in lines; one line is about 16px. */
const LINE_HEIGHT_PX = 16;
/** A nested element marked with this attribute scrolls vertically first. */
export const VERTICAL_SCROLL_REGION_ATTRIBUTE = 'data-vertical-scroll-region';

function toPixels(event: WheelEvent): number {
  return event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? event.deltaY * LINE_HEIGHT_PX
    : event.deltaY;
}

function canScrollVertically(element: HTMLElement, delta: number): boolean {
  return delta > 0
    ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
    : element.scrollTop > 0;
}

/**
 * Lets a plain mouse wheel scroll a horizontal strip sideways. A trackpad's
 * sideways swipe and pinch-zoom pass through untouched. Over a nested region
 * marked with `data-vertical-scroll-region`, the wheel scrolls that region
 * until it reaches its end, then moves the strip. At either end of the strip
 * the wheel scrolls the page again.
 */
export function useHorizontalWheelScroll<
  T extends HTMLElement,
>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const strip = ref.current;
    if (!strip) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!strip || event.ctrlKey) {
        return;
      }
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
        return;
      }

      const delta = toPixels(event);
      const region =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              `[${VERTICAL_SCROLL_REGION_ATTRIBUTE}]`,
            )
          : null;
      if (region && canScrollVertically(region, delta)) {
        return;
      }

      const maxScrollLeft = strip.scrollWidth - strip.clientWidth;
      const nextScrollLeft = Math.min(
        maxScrollLeft,
        Math.max(0, strip.scrollLeft + delta),
      );
      if (nextScrollLeft === strip.scrollLeft) {
        return;
      }

      event.preventDefault();
      strip.scrollLeft = nextScrollLeft;
    }

    strip.addEventListener('wheel', handleWheel, { passive: false });
    return () => strip.removeEventListener('wheel', handleWheel);
  }, []);

  return ref;
}
