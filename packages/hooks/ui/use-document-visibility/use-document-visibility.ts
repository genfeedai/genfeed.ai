import { useSyncExternalStore } from 'react';

function subscribeToVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);

  return () => {
    document.removeEventListener('visibilitychange', onChange);
  };
}

function getVisibilitySnapshot(): boolean {
  return !document.hidden;
}

function getServerVisibilitySnapshot(): boolean {
  return true;
}

/**
 * Hook that tracks the document visibility state.
 * Returns `true` when the document is visible, `false` when hidden.
 * Useful for pausing polling or animations when the tab is not active.
 */
export function useDocumentVisibility(): boolean {
  return useSyncExternalStore(
    subscribeToVisibility,
    getVisibilitySnapshot,
    getServerVisibilitySnapshot,
  );
}
