'use client';

import type { InfiniteScrollProps } from '@genfeedai/props/ui/content/infinite-scroll.props';
import Loading from '@ui/loading/default/Loading';
import { useEffect, useRef } from 'react';

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

    if (!target || !hasMore || !enabled) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(target);

    return () => observer.unobserve(target);
  }, [hasMore, isLoading, onLoadMore, threshold, rootMargin, enabled]);

  return (
    <div className={className}>
      {children}

      {hasMore && (
        <div ref={observerTarget} className="w-full py-4 flex justify-center">
          {isLoading && (loadingIndicator || <Loading />)}
        </div>
      )}
    </div>
  );
}
