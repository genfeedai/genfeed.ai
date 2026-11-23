import { useCallback, useRef, useState } from 'react';

export interface ReleasePendingActions {
  /** Release ids whose request is running right now, set synchronously. */
  inFlightReleaseIds: Set<string>;
  /** Action identifier in flight per release id; absent when idle. */
  pendingActions: ReadonlyMap<string, string>;
  /** `null` marks the release idle. Functional, so completions never clobber. */
  setPendingAction: (releaseId: string, action: string | null) => void;
}

/**
 * Pending state is tracked per release so a second release's action neither
 * hides nor clears the first one's. The ref set is the synchronous guard that
 * rejects a duplicate call before any render has disabled the control.
 */
export function useReleasePendingActions(): ReleasePendingActions {
  const [pendingActions, setPendingActions] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  const setPendingAction = useCallback(
    (releaseId: string, action: string | null) => {
      setPendingActions((current) => {
        const next = new Map(current);
        if (action === null) {
          next.delete(releaseId);
        } else {
          next.set(releaseId, action);
        }
        return next;
      });
    },
    [],
  );

  return {
    inFlightReleaseIds: inFlightRef.current,
    pendingActions,
    setPendingAction,
  };
}
