'use client';

import { useSyncExternalStore } from 'react';

export interface HistoryNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
}

function readNavigation(): Navigation | null {
  return typeof window !== 'undefined' && 'navigation' in window
    ? window.navigation
    : null;
}

function subscribe(listener: () => void): () => void {
  const navigation = readNavigation();
  navigation?.addEventListener('currententrychange', listener);
  return () => {
    navigation?.removeEventListener('currententrychange', listener);
  };
}

// Without the Navigation API there is no way to know, so both stay enabled
// and a no-op back/forward is the worst case.
const getCanGoBack = () => readNavigation()?.canGoBack ?? true;
const getCanGoForward = () => readNavigation()?.canGoForward ?? true;
const getServerFalse = () => false;

/** Whether the window's session history has an entry behind / ahead. */
export function useHistoryNavigation(): HistoryNavigationState {
  const canGoBack = useSyncExternalStore(
    subscribe,
    getCanGoBack,
    getServerFalse,
  );
  const canGoForward = useSyncExternalStore(
    subscribe,
    getCanGoForward,
    getServerFalse,
  );

  return { canGoBack, canGoForward };
}
