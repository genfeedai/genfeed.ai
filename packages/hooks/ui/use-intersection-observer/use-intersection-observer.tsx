import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  useEffect(() => {
    if (!ref.current || frozen.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setEntry(entry);
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

  return { entry, isIntersecting, ref };
}

/**
 * Hook for infinite scrolling
 */
export function useInfiniteScroll(
  callback: () => void,
  options: {
    threshold?: number;
    rootMargin?: string;
    enabled?: boolean;
  } = {},
) {
  const { threshold = 0, rootMargin = '100px', enabled = true } = options;
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      if (!enabled || !node) {
        return;
      }

      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            callback();
          }
        },
        { rootMargin, threshold },
      );

      observerRef.current.observe(node);
    },
    [callback, threshold, rootMargin, enabled],
  );

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return loadMoreRef;
}
