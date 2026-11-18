import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useMobileAuth } from '@/contexts/auth-context';
import { sentryService } from '@/services/sentry.service';
import {
  type ConnectionState,
  type WebSocketMessage,
  websocketService,
} from '@/services/websocket.service';

const BACKGROUND_APP_STATE_PATTERN = /inactive|background/;

function subscribeToAppStateChange(
  handler: (nextAppState: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener('change', handler);
  return () => subscription.remove();
}

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (type: string, data: Record<string, unknown>) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const { getToken, isSignedIn } = useMobileAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>(() =>
    websocketService.getConnectionState(),
  );
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const connect = useCallback(async () => {
    if (!isSignedIn) {
      return;
    }

    try {
      const token = await getToken();
      if (token) {
        websocketService.connect(token);
      }
    } catch (error) {
      sentryService.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { operation: 'getWebSocketToken' },
      );
    }
  }, [getToken, isSignedIn]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  const send = useCallback((type: string, data: Record<string, unknown>) => {
    websocketService.send(type, data);
  }, []);

  // use-effect-audit: ignore subscribes to app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current?.match(BACKGROUND_APP_STATE_PATTERN) &&
        nextAppState === 'active'
      ) {
        connect();
      }
      appStateRef.current = nextAppState;
    };

    return subscribeToAppStateChange(handleAppStateChange);
  }, [connect]);

  // use-effect-audit: ignore subscribes to websocket events
  useEffect(() => {
    const handleConnectionStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
    };

    const handleMessage = (message: WebSocketMessage) => {
      setLastMessage(message);
    };

    websocketService.on('connectionStateChanged', handleConnectionStateChanged);
    websocketService.on('message', handleMessage);

    return () => {
      websocketService.off(
        'connectionStateChanged',
        handleConnectionStateChanged,
      );
      websocketService.off('message', handleMessage);
    };
  }, []);

  // use-effect-audit: ignore connects and disconnects the websocket service with the signed-in state
  useEffect(() => {
    if (isSignedIn) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isSignedIn, connect, disconnect]);

  return {
    connect,
    connectionState,
    disconnect,
    isConnected: connectionState === 'connected',
    lastMessage,
    send,
  };
}
