import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface IUseIntersectionObserverOptions {
  threshold?: number | number[];
  root?: Element | null;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook to observe element intersection with viewport
 */
export function useIntersectionObserver<T extends HTMLElement = HTMLDivElement>(
  options: IUseIntersectionObserverOptions = {},
): {
  ref: RefObject<T | null>;
  isIntersecting: boolean;
  entry?: IntersectionObserverEntry;
} {
  const {
    threshold = 0,
    root = null,
    rootMargin = '0px',
    triggerOnce = false,
  } = options;

  const ref = useRef<T | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry>();
  const [isIntersecting, setIsIntersecting] = useState(false);

  const frozen = useRef(false);

  /* eslint-disable react-doctor/no-adjust-state-on-prop-change -- IntersectionObserver is an external subscription; state changes come from observer callbacks, not prop mirroring. */
  useEffect(() => {
    if (!ref.current || frozen.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- IntersectionObserver writes subscription state from an observer callback.
        setEntry(entry);
        // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- IntersectionObserver writes subscription state from an observer callback.
        setIsIntersecting(entry.isIntersecting);

        if (entry.isIntersecting && triggerOnce) {
          frozen.current = true;
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(ref.current);

    return () => {
      observer.disconnect();
    };
  }, [threshold, root, rootMargin, triggerOnce]);
  /* eslint-enable react-doctor/no-adjust-state-on-prop-change */

  return { entry, isIntersecting, ref };
}
