'use client';

import type {
  ISocketEventHandler,
  ISocketManagerConfig,
} from '@genfeedai/contracts/interfaces';
import type { UseSocketManagerOptions } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { logger } from '@genfeedai/services/core/logger.service';
import { SocketManager } from '@genfeedai/services/core/socket-manager.service';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface SocketSubscription<T = unknown> {
  event: string;
  handler: ISocketEventHandler<T>;
}

/**
 * React hook for managing socket connections with automatic cleanup
 */
const EMPTY_SOCKET_MANAGER_OPTIONS: ISocketManagerConfig = {};

export function useSocketManager(
  options: ISocketManagerConfig = EMPTY_SOCKET_MANAGER_OPTIONS,
) {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  const socketManagerRef = useRef<SocketManager | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'offline'
  >('connecting');
  const disableSocketsForPlaywright =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true';

  const latestOptionsRef = useRef(options);

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeConnectionState: (() => void) | undefined;

    if (disableSocketsForPlaywright) {
      setConnectionState('offline');
      setIsReady(false);
      return () => {
        isMounted = false;
      };
    }

    if (!effectiveIsAuthLoaded || !effectiveIsSignedIn) {
      SocketManager.clearInstance();
      socketManagerRef.current = null;
      setConnectionState('offline');
      setIsReady(false);
      return () => {
        isMounted = false;
      };
    }

    const initializeSocket = async () => {
      try {
        const token = await resolveAuthToken(getToken);

        if (!token) {
          if (isMounted) {
            setConnectionState('offline');
            setIsReady(false);
          }
          return;
        }

        // Use singleton socket manager with token
        if (isMounted) {
          socketManagerRef.current = SocketManager.getInstance({
            ...latestOptionsRef.current,
            resolveToken: () =>
              resolveAuthToken(getToken, { forceRefresh: true }),
            token,
          });
          unsubscribeConnectionState =
            socketManagerRef.current.subscribeConnectionState(
              setConnectionState,
            );

          setIsReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setConnectionState('offline');
          setIsReady(false);
        }

        logger.error('Failed to initialize socket with token:', error);
      }
    };

    initializeSocket();

    // We don't cleanup the singleton on unmount, as it's shared
    // The singleton will handle its own cleanup when needed
    return () => {
      isMounted = false;
      unsubscribeConnectionState?.();
      setIsReady(false);
    };
  }, [
    disableSocketsForPlaywright,
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    getToken,
  ]);

  const subscribe = useCallback(
    <T = unknown>(event: string, handler: ISocketEventHandler<T>) => {
      if (socketManagerRef.current) {
        return socketManagerRef.current.subscribe(event, handler);
      }

      return () => {};
    },
    [],
  );

  const unsubscribe = useCallback(
    <T = unknown>(event: string, handler?: ISocketEventHandler<T>) => {
      if (socketManagerRef.current) {
        socketManagerRef.current.unsubscribe(event, handler);
      }
    },
    [],
  );

  const cleanup = useCallback(() => {
    if (socketManagerRef.current) {
      socketManagerRef.current.cleanup();
    }
  }, []);

  const isConnected = useCallback(() => {
    return socketManagerRef.current?.isConnected() || false;
  }, []);

  const connect = useCallback(() => {
    if (socketManagerRef.current) {
      socketManagerRef.current.connect();
    }
  }, []);

  const getListenersCount = useCallback(() => {
    return socketManagerRef.current?.getListenersCount() || 0;
  }, []);

  const getSocketManager = useCallback(() => {
    return socketManagerRef.current;
  }, []);

  return {
    cleanup,
    connect,
    connectionState,
    getListenersCount,
    getSocketManager,
    isConnected,
    isReady,
    subscribe,
    unsubscribe,
  };
}

/**
 * Hook for socket subscriptions. Pass a memoized array — a single event
 * subscribes as `[{ event, handler }]`.
 */
export const useSocketSubscriptions = <T = unknown>(
  subscriptions: SocketSubscription<T>[],
  options: UseSocketManagerOptions = {},
) => {
  const { subscribe, getSocketManager, isReady } = useSocketManager(options);

  useEffect(() => {
    if (subscriptions.length === 0 || !isReady) {
      return;
    }

    const disposers = subscriptions.map(({ event, handler }) =>
      subscribe<T>(event, handler),
    );

    return () => {
      disposers.forEach((dispose) => {
        dispose();
      });
    };
  }, [subscriptions, subscribe, isReady]);

  return { getSocketManager };
};
