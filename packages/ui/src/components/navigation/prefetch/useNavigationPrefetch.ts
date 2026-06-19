'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef } from 'react';

function isPrefetchableHref(href?: string): href is string {
  if (!href || href.startsWith('#')) {
    return false;
  }

  if (href.startsWith('/')) {
    return !href.startsWith('//');
  }

  return false;
}

export function useNavigationPrefetch(href?: string) {
  const router = useRouter();
  const prefetchedHrefs = useRef(new Set<string>());

  return useCallback(() => {
    if (!isPrefetchableHref(href) || prefetchedHrefs.current.has(href)) {
      return;
    }

    prefetchedHrefs.current.add(href);
    router.prefetch(href);
  }, [href, router]);
}
