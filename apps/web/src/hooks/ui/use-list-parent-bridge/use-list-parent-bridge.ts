import { useEffect, useRef } from 'react';

interface UseListParentBridgeOptions {
  isLoading: boolean;
  isRefreshing: boolean;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefresh?: (callback: () => void) => void;
  onRefreshingChange?: (isRefreshing: boolean) => void;
  refresh: () => unknown;
}

/**
 * Reports a list's loading and refreshing state to its parent surface and
 * hands the parent a refresh callback. The parent callbacks are read through
 * refs, so a parent that recreates them on every render does not re-run the
 * reports.
 */
export function useListParentBridge({
  isLoading,
  isRefreshing,
  onLoadingChange,
  onRefresh,
  onRefreshingChange,
  refresh,
}: UseListParentBridgeOptions): void {
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  // use-effect-audit: ignore keeps refs to the latest parent callbacks
  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  // use-effect-audit: ignore reports loading state to the parent surface
  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  // use-effect-audit: ignore reports refreshing state to the parent surface
  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  // use-effect-audit: ignore registers the refresh callback with the parent surface
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refresh());
    }
  }, [onRefresh, refresh]);
}
