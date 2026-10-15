'use client';

import type { InfiniteScrollProps } from '@genfeedai/props/ui/content/infinite-scroll.props';
import Loading from '@ui/loading/default/Loading';
import { useEffect, useRef } from 'react';

/**
 * Nearest ancestor that scrolls vertically. Observing against it (not the
 * viewport) is what makes `rootMargin` prefetch ahead inside a nested scroll
 * container: the viewport margin is clipped away by the container.
 */
function findScrollRoot(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export default function InfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading = false,
  children,
  className = '',
  loadingIndicator,
  threshold = 0,
  rootMargin = '100px',
  enabled = true,
}: InfiniteScrollProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;

    if (!target || !hasMore || !enabled || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void onLoadMore();
        }
      },
      { root: findScrollRoot(target), rootMargin, threshold },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, threshold, rootMargin, enabled]);

  return (
    <div className={className}>
      {children}

      {hasMore && (
        <div
          ref={observerTarget}
          className="flex w-full justify-center py-4"
          data-testid="infinite-scroll-sentinel"
        >
          {isLoading && (loadingIndicator || <Loading />)}
        </div>
      )}
    </div>
  );
}
