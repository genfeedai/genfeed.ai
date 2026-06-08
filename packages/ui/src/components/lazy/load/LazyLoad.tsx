'use client';

import { useIntersectionObserver } from '@genfeedai/hooks/ui/use-intersection-observer/use-intersection-observer';
import type { LazyLoadProps } from '@genfeedai/props/components/lazy-load.props';
import Loading from '@ui/loading/default/Loading';

export default function LazyLoad({
  children,
  placeholder = <Loading />,
  rootMargin = '50px',
  threshold = 0,
  minHeight = '200px',
}: LazyLoadProps) {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    rootMargin,
    threshold,
    triggerOnce: true,
  });

  return (
    <div ref={ref} style={{ minHeight: isIntersecting ? 'auto' : minHeight }}>
      {isIntersecting ? children : placeholder}
    </div>
  );
}
