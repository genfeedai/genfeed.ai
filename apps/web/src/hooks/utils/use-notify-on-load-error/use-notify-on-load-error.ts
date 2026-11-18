'use client';

import { useEffect, useEffectEvent } from 'react';

interface UseNotifyOnLoadErrorOptions {
  /** `errorUpdatedAt` of the failed query: changes once per failed read. */
  errorUpdatedAt: number;
  hasError: boolean;
  notify: () => void;
}

/**
 * Raises one notification per failed read, after its retries, not one per
 * attempt. `errorUpdatedAt` marks each new failed read, so a second failure
 * notifies again while a re-render of the same failure does not.
 */
export function useNotifyOnLoadError({
  errorUpdatedAt,
  hasError,
  notify,
}: UseNotifyOnLoadErrorOptions): void {
  const notifyOnError = useEffectEvent(notify);

  // use-effect-audit: ignore raises a user notification once per failed read
  useEffect(() => {
    void errorUpdatedAt;
    if (hasError) {
      notifyOnError();
    }
  }, [errorUpdatedAt, hasError]);
}
