import { WebSocketEventStatus } from '@genfeedai/contracts';
import type {
  IIngredient,
  IMediaEventData,
} from '@genfeedai/contracts/interfaces';
import { WebSocketPaths } from '@genfeedai/utils/network/websocket.util';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useCallback, useEffect, useRef } from 'react';

interface UseVideoVersionRefreshOptions {
  onRefresh?: () => void | Promise<void>;
}

/**
 * Refreshes the list when a new version of a video (mirror, reverse, repost
 * variant) is created, and again when its encode finishes or fails. The API
 * answers with the new version while it is still processing and announces the
 * end on the version's own socket path, which no list listens to.
 */
export function useVideoVersionRefresh({
  onRefresh,
}: UseVideoVersionRefreshOptions = {}) {
  const { subscribe } = useSocketManager();
  const unsubscribersRef = useRef<Set<() => void>>(new Set());
  const onRefreshRef = useRef(onRefresh);

  // use-effect-audit: ignore keeps a ref to the latest refresh callback
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // use-effect-audit: ignore releases socket subscriptions on unmount
  useEffect(() => {
    const unsubscribers = unsubscribersRef.current;
    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
      unsubscribers.clear();
    };
  }, []);

  return useCallback(
    (version?: IIngredient) => {
      void onRefreshRef.current?.();
      if (!version?.id) {
        return;
      }

      const unsubscribers = unsubscribersRef.current;
      const unsubscribeSocket = subscribe<IMediaEventData>(
        WebSocketPaths.video(version.id),
        (event) => {
          if (
            event.status !== WebSocketEventStatus.COMPLETED &&
            event.status !== WebSocketEventStatus.FAILED
          ) {
            return;
          }
          release();
          void onRefreshRef.current?.();
        },
      );
      function release() {
        unsubscribeSocket();
        unsubscribers.delete(release);
      }
      unsubscribers.add(release);
    },
    [subscribe],
  );
}
