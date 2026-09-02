'use client';

import type { UseVisiblePollingOptions } from '@genfeedai/contracts/interfaces';
import { useDocumentVisibility } from '@hooks/ui/use-document-visibility/use-document-visibility';
import { useEffect, useRef } from 'react';

/**
 * Poll on an interval, but only while the tab is in front.
 *
 * A hidden tab's poll costs a request, a render, and — on a laptop — a wake
 * from idle, for data nobody is looking at. Polling resumes on the way back,
 * starting with an immediate call so the first visible frame is not the stale
 * data the tab was hidden with.
 *
 * The callback is read from a ref, so an inline arrow does not restart the
 * timer on every render.
 */
export function useVisiblePolling(
  poll: () => void,
  { intervalMs, isEnabled = true }: UseVisiblePollingOptions,
): void {
  const isVisible = useDocumentVisibility();
  const pollRef = useRef(poll);
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  useEffect(() => {
    if (!isVisible) {
      wasHiddenRef.current = true;
      return undefined;
    }

    if (!isEnabled) {
      return undefined;
    }

    // Coming back from a hidden tab, the data is as stale as the tab was
    // hidden. Catch up before resuming the cadence.
    if (wasHiddenRef.current) {
      wasHiddenRef.current = false;
      pollRef.current();
    }

    const intervalId = window.setInterval(() => {
      pollRef.current();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [intervalMs, isEnabled, isVisible]);
}
