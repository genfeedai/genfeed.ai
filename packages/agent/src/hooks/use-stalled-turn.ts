'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A running turn that shows no new stream event, message, tool call or
 * execution progress for this long is treated as stalled. It matches the
 * completion recovery grace period, so the notice appears at the point the
 * client would already start second-guessing the stream.
 */
export const STALLED_TURN_THRESHOLD_MS = 90_000;

export interface UseStalledTurnOptions {
  isActive: boolean;
  isForcedStalled?: boolean;
  progressKey: string;
}

/**
 * Tracks whether the active turn has gone quiet. `progressKey` is any string
 * that changes whenever the turn produces something new; every change restarts
 * the stall clock. `isForcedStalled` marks a stall the runtime already proved
 * (execution lookup kept returning 404) without waiting for the clock.
 */
export function useStalledTurn({
  isActive,
  isForcedStalled = false,
  progressKey,
}: UseStalledTurnOptions): {
  isStalled: boolean;
  keepWaiting: () => void;
} {
  const [isClockStalled, setIsClockStalled] = useState(false);
  const [restartNonce, setRestartNonce] = useState(0);

  // `progressKey` and `restartNonce` are restart triggers, not inputs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restart triggers
  useEffect(() => {
    setIsClockStalled(false);
    if (!isActive) {
      return;
    }
    const timer = setTimeout(
      () => setIsClockStalled(true),
      STALLED_TURN_THRESHOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [isActive, progressKey, restartNonce]);

  const keepWaiting = useCallback(() => {
    setRestartNonce((nonce) => nonce + 1);
  }, []);

  return {
    isStalled: isActive && (isClockStalled || isForcedStalled),
    keepWaiting,
  };
}
