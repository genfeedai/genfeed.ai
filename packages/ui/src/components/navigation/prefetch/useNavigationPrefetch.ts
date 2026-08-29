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

/**
 * Prefetch a navigation destination on hover or focus, once per mount.
 *
 * Navigation chrome pairs this with `prefetch={false}` on the link: Next's
 * default prefetches every link in the viewport, and a sidebar or tab strip
 * puts its entire destination list in the viewport at once. Hover and focus
 * are the signals that the operator is actually going somewhere, and focus is
 * one the framework never prefetches on.
 *
 * Content links keep the framework default. This is for chrome that renders
 * many destinations at once.
 */
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
