'use client';

import type { SocialInboxRealtimeEvent } from '@genfeedai/interfaces';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef } from 'react';
import { captureMessagesSurfaceEvent } from './messages-surface-telemetry';

type MessagesConnectionState =
  | 'connected'
  | 'connecting'
  | 'offline'
  | 'reconnecting';

interface UseMessagesRealtimeParams {
  readonly onRefresh: () => void | Promise<void>;
  readonly organizationId?: string;
}

export function useMessagesRealtime({
  onRefresh,
  organizationId,
}: UseMessagesRealtimeParams): MessagesConnectionState {
  const { connectionState, isReady, subscribe } = useSocketManager();
  const previousConnectionState = useRef<MessagesConnectionState | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRefresh = useRef(onRefresh);

  useEffect(() => {
    latestRefresh.current = onRefresh;
  }, [onRefresh]);

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
    const unsubscribe = subscribe<SocialInboxRealtimeEvent>(
      WebSocketPaths.socialInbox(organizationId),
      scheduleRefresh,
    );

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
