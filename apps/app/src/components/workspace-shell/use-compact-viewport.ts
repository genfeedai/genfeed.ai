'use client';

import { CONTEXT_SIDEBAR_COMPACT_QUERY } from '@contexts/ui/context-sidebar-context';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return () => undefined;
  }

  const query = window.matchMedia(CONTEXT_SIDEBAR_COMPACT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(CONTEXT_SIDEBAR_COMPACT_QUERY).matches
  );
}

/** Below `xl`, where shell side panels render as drawers. */
export function useIsCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
