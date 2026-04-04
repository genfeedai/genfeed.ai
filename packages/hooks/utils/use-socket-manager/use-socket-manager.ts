'use client';

import { useAuth } from '@clerk/nextjs';
import type {
  ISocketEventHandler,
  ISocketManagerConfig,
} from '@cloud/interfaces';
import type { UseSocketManagerOptions } from '@cloud/interfaces/hooks/hooks.interface';
import {
  getPlaywrightAuthState,
  resolveClerkToken,
} from '@helpers/auth/clerk.helper';
import { logger } from '@services/core/logger.service';
import { SocketManager } from '@services/core/socket-manager.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SocketSubscription<T = unknown> {
  event: string;
  handler: ISocketEventHandler<T>;
}

/**
 * React hook for managing socket connections with automatic cleanup
 */
export function useSocketManager(options: ISocketManagerConfig = {}) {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuth();
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

  const _optionsKey = useMemo(() => JSON.stringify(options ?? {}), [options]);
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
      setConnectionState('offline');
      setIsReady(false);
      return () => {
        isMounted = false;
      };
    }

    const initializeSocket = async () => {
      try {
        const token = await resolveClerkToken(getToken);

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

  const subscribeMultiple = useCallback(
    <T = unknown>(subscriptions: SocketSubscription<T>[]) => {
      if (socketManagerRef.current) {
        return socketManagerRef.current.subscribeMultiple(subscriptions);
      }

      return [] as (() => void)[];
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
    subscribeMultiple,
    unsubscribe,
  };
}

/**
 * Hook for simple single event socket subscription
 */
export const useSocketSubscription = <T = unknown>(
  event: string,
  handler: ISocketEventHandler<T>,
  options: UseSocketManagerOptions = {},
) => {
  const { subscribe, getSocketManager, isReady } = useSocketManager(options);

  useEffect(() => {
    if (!event || !handler || !isReady) {
      return;
    }

    const dispose = subscribe<T>(event, handler);

    return () => {
      dispose();
    };
  }, [event, handler, subscribe, isReady]);

  return { getSocketManager };
};

/**
 * Hook for multiple socket subscriptions
 */
export const useSocketSubscriptions = <T = unknown>(
  subscriptions: SocketSubscription<T>[],
  options: UseSocketManagerOptions = {},
) => {
  const { subscribeMultiple, getSocketManager, isReady } =
    useSocketManager(options);

  useEffect(() => {
    if (subscriptions.length === 0 || !isReady) {
      return;
    }

    const disposers = subscribeMultiple<T>(subscriptions);

    return () => {
      disposers.forEach((dispose) => {
        dispose();
      });
    };
  }, [subscriptions, subscribeMultiple, isReady]);

  return { getSocketManager };
};
