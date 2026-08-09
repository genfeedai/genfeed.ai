import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import { useEffect, useState } from 'react';

/**
 * Grace period before surface a non-connected socket state in the composer.
 *
 * Local `nest-fast-dev` / Next HMR restarts drop the agent WebSocket for a few
 * hundred milliseconds. Flashing the amber reconnect banner (and growing the
 * status stack into overflow-hidden parents) makes the UI thrash and clip.
 * Recovery to `connected` is always applied immediately.
 */
export const SOCKET_CONNECTION_UI_GRACE_MS = 1_200;

export function useStableSocketConnectionState(
  connectionState: AgentSocketConnectionState,
  graceMs: number = SOCKET_CONNECTION_UI_GRACE_MS,
): AgentSocketConnectionState {
  const [stableState, setStableState] =
    useState<AgentSocketConnectionState>(connectionState);

  useEffect(() => {
    if (connectionState === 'connected') {
      setStableState('connected');
      return;
    }

    // Stay on the last stable connected view until the outage outlives the
    // grace window. Intermediate connecting/reconnecting/offline hops during
    // a restart do not re-arm layout thrash.
    if (stableState !== 'connected') {
      setStableState(connectionState);
      return;
    }

    const timer = window.setTimeout(() => {
      setStableState(connectionState);
    }, graceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [connectionState, graceMs, stableState]);

  return stableState;
}
