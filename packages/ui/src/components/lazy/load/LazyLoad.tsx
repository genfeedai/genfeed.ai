'use client';

import { useIntersectionObserver } from '@genfeedai/hooks/ui/use-intersection-observer/use-intersection-observer';
import type { LazyLoadProps } from '@genfeedai/props/components/lazy-load.props';
import Loading from '@ui/loading/default/Loading';
import { useEffect, useState } from 'react';

export default function LazyLoad({
  children,
  placeholder = <Loading />,
  rootMargin = '50px',
  threshold = 0,
  minHeight = '200px',
}: LazyLoadProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    rootMargin,
    threshold,
    triggerOnce: true,
  });

  useEffect(() => {
    if (isIntersecting && !shouldRender) {
      setShouldRender(true);
    }
  }, [isIntersecting, shouldRender]);

  return (
    <div ref={ref} style={{ minHeight: shouldRender ? 'auto' : minHeight }}>
      {shouldRender ? children : placeholder}
    </div>
  );
}
