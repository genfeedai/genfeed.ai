'use client';

import { type RefObject, useEffect, useState } from 'react';

/**
 * The element's current `offsetHeight`, kept up to date with a
 * ResizeObserver. Null until the first measurement, and always null where
 * ResizeObserver does not exist.
 */
export function useElementHeight(
  ref: RefObject<HTMLElement | null>,
): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
