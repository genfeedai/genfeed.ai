import { useLayoutEffect, useState } from 'react';

/**
 * Live height of a floating overlay (composer portal). Used to pad the
 * transcript so the last message can scroll above the overlay.
 */
export function useOverlayElementHeight(element: HTMLElement | null): number {
  const [heightPx, setHeightPx] = useState(0);

  useLayoutEffect(() => {
    if (!element) {
      setHeightPx(0);
      return;
    }

    const update = () => {
      setHeightPx(Math.ceil(element.getBoundingClientRect().height));
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return heightPx;
}
