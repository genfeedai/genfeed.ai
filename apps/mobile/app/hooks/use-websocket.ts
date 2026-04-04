import { useAuth } from '@clerk/clerk-expo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ConnectionState,
  WebSocketMessage,
  websocketService,
} from '@/services/websocket.service';

interface UseWebSocketReturn {
  connectionState: ConnectionState;
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (type: string, data: Record<string, unknown>) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const { getToken, isSignedIn } = useAuth();
  const [connectionState, setConnectionState] = useState<ConnectionState>(
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
    } catch {
      // Failed to get token
    }
  }, [getToken, isSignedIn]);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  const send = useCallback((type: string, data: Record<string, unknown>) => {
    websocketService.send(type, data);
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        connect();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [connect]);

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

export function useWebSocketEvent<T = unknown>(
  eventType: string,
  callback: (data: T) => void,
): void {
  useEffect(() => {
    const handler = (data: T) => {
      callback(data);
    };

    websocketService.on(eventType, handler);

    return () => {
      websocketService.off(eventType, handler);
    };
  }, [eventType, callback]);
}
