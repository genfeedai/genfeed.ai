import type {
  SocialInboxRealtimeEvent,
  SocialInboxSyncRealtimeEvent,
} from '@genfeedai/contracts/interfaces';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef } from 'react';
import type { UseMessagesRealtimeParams } from '@/features/messages/props/messages-realtime.props';
import { captureMessagesSurfaceEvent } from './messages-surface-telemetry';

type MessagesConnectionState =
  | 'connected'
  | 'connecting'
  | 'offline'
  | 'reconnecting';

function isSyncResultEvent(
  event: SocialInboxRealtimeEvent | SocialInboxSyncRealtimeEvent | undefined,
): event is SocialInboxSyncRealtimeEvent {
  return event?.kind === 'sync-completed' || event?.kind === 'sync-failed';
}

export function useMessagesRealtime({
  onRefresh,
  onSyncResult,
  organizationId,
}: UseMessagesRealtimeParams): MessagesConnectionState {
  const { connectionState, isReady, subscribe } = useSocketManager();
  const previousConnectionState = useRef<MessagesConnectionState | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRefresh = useRef(onRefresh);
  const latestSyncResult = useRef(onSyncResult);

  useEffect(() => {
    latestRefresh.current = onRefresh;
    latestSyncResult.current = onSyncResult;
  }, [onRefresh, onSyncResult]);

  const refresh = useCallback(() => {
    Promise.resolve(latestRefresh.current()).catch(() => {
      captureMessagesSurfaceEvent({
        action: 'realtime-refresh',
        connectionState,
        outcome: 'failed',
      });
    });
  }, [connectionState]);

  useEffect(() => {
    if (!organizationId || !isReady) {
      return;
    }

    const scheduleRefresh = () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
      refreshTimer.current = setTimeout(() => {
        captureMessagesSurfaceEvent({
          action: 'realtime-refresh',
          connectionState,
          outcome: 'started',
        });
        refresh();
      }, 250);
    };
    const unsubscribe = subscribe<
      SocialInboxRealtimeEvent | SocialInboxSyncRealtimeEvent
    >(WebSocketPaths.socialInbox(organizationId), (event) => {
      if (isSyncResultEvent(event)) {
        latestSyncResult.current?.(event);
      }
      scheduleRefresh();
    });

    return () => {
      unsubscribe();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [connectionState, isReady, organizationId, refresh, subscribe]);

  useEffect(() => {
    const previous = previousConnectionState.current;
    previousConnectionState.current = connectionState;

    if (
      connectionState === 'connected' &&
      (previous === 'offline' || previous === 'reconnecting')
    ) {
      captureMessagesSurfaceEvent({
        action: 'realtime-refresh',
        connectionState,
        outcome: 'started',
      });
      refresh();
    }
  }, [connectionState, refresh]);

  return connectionState;
}
