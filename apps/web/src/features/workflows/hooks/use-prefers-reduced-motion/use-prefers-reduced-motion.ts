'use client';

import { useSyncExternalStore } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function getReducedMotionQuery(): MediaQueryList | null {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return null;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const query = getReducedMotionQuery();
  if (!query) {
    return () => undefined;
  }
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return getReducedMotionQuery()?.matches ?? false;
}

/** The server cannot know the preference, so it renders the still state. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Live `prefers-reduced-motion: reduce`. Follows the OS setting while
 * mounted, so motion stops as soon as the viewer turns it off.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
