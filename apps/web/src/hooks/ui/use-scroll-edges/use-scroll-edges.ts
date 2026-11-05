'use client';

import { type RefObject, useEffect, useState } from 'react';
import type { ScrollEdges } from '@/props/ui/scroll-strip.props';

/** Leaves a pixel of slack for fractional scroll positions. */
const EDGE_TOLERANCE_PX = 1;

function readEdges(element: HTMLElement): ScrollEdges {
  const maxScrollLeft = element.scrollWidth - element.clientWidth;
  return {
    canScrollEnd: element.scrollLeft < maxScrollLeft - EDGE_TOLERANCE_PX,
    canScrollStart: element.scrollLeft > EDGE_TOLERANCE_PX,
  };
}

/**
 * Whether a horizontal strip has more to show on either side, kept current as
 * it scrolls or resizes. Drives the strip's edge fades and arrows.
 */
export function useScrollEdges(
  ref: RefObject<HTMLElement | null>,
): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({
    canScrollEnd: false,
    canScrollStart: false,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    function update() {
      if (!element) {
        return;
      }
      const next = readEdges(element);
      setEdges((current) =>
        current.canScrollEnd === next.canScrollEnd &&
        current.canScrollStart === next.canScrollStart
          ? current
          : next,
      );
    }

    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref]);

  return edges;
}
