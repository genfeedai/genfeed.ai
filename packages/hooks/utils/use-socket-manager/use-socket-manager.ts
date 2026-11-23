'use client';

import type {
  ISocketEventHandler,
  ISocketManagerConfig,
} from '@genfeedai/contracts/interfaces';
import type { UseSocketManagerOptions } from '@genfeedai/contracts/interfaces/hooks/hooks.interface';
import { requestOrganizationGate } from '@genfeedai/services/core/interceptor.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { SocketManager } from '@genfeedai/services/core/socket-manager.service';
import {
  getPlaywrightAuthState,
  resolveAuthToken,
} from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

export interface SocketSubscription<T = unknown> {
  event: string;
  handler: ISocketEventHandler<T>;
}

/**
 * React hook for managing socket connections with automatic cleanup
 */
const EMPTY_SOCKET_MANAGER_OPTIONS: ISocketManagerConfig = {};

function subscribeToOrganizationGate(onChange: () => void): () => void {
  return requestOrganizationGate.subscribe(onChange);
}

function isOrganizationProvisional(): boolean {
  return requestOrganizationGate.isProvisional();
}

function isNeverProvisionalOnServer(): boolean {
  return false;
}

export function useSocketManager(
  options: ISocketManagerConfig = EMPTY_SOCKET_MANAGER_OPTIONS,
) {
  const { getToken, isLoaded: isAuthLoaded, isSignedIn } = useAuthIdentity();
  const playwrightAuth = getPlaywrightAuthState();
  const effectiveIsAuthLoaded =
    isAuthLoaded || playwrightAuth?.isLoaded === true;
  const effectiveIsSignedIn = isSignedIn || playwrightAuth?.isSignedIn === true;
  // The gateway joins `org-<id>` rooms from the organization the server
  // resolves for the user. While the page is drawn from a saved copy that is
  // not yet confirmed to be the organization on screen, so no socket opens.
  const isOrganizationConfirmationPending = useSyncExternalStore(
    subscribeToOrganizationGate,
    isOrganizationProvisional,
    isNeverProvisionalOnServer,
  );
  const socketManagerRef = useRef<SocketManager | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'offline'
  >('connecting');
  const disableSocketsForPlaywright =
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true' &&
    playwrightAuth?.isSocketFixtureEnabled !== true;

  const latestOptionsRef = useRef(options);

  // use-effect-audit: ignore keeps refs to the latest callbacks and values
  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  // use-effect-audit: ignore connects to and subscribes to the shared socket manager
  useEffect(() => {
    const abortController = new AbortController();
    let unsubscribeConnectionState: (() => void) | undefined;

    if (disableSocketsForPlaywright) {
      setConnectionState('offline');
      setIsReady(false);
      return () => {
        abortController.abort();
      };
    }

    if (
      !effectiveIsAuthLoaded ||
      !effectiveIsSignedIn ||
      isOrganizationConfirmationPending
    ) {
      SocketManager.clearInstance();
      socketManagerRef.current = null;
      setConnectionState('offline');
      setIsReady(false);
      return () => {
        abortController.abort();
      };
    }

    const initializeSocket = async () => {
      try {
        const token = await resolveAuthToken(getToken);

        if (!token) {
          if (!abortController.signal.aborted) {
            setConnectionState('offline');
            setIsReady(false);
          }
          return;
        }

        if (!abortController.signal.aborted) {
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
        if (!abortController.signal.aborted) {
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
      abortController.abort();
      unsubscribeConnectionState?.();
      setIsReady(false);
    };
  }, [
    disableSocketsForPlaywright,
    effectiveIsAuthLoaded,
    effectiveIsSignedIn,
    getToken,
    isOrganizationConfirmationPending,
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

  // use-effect-audit: ignore subscribes to socket events and disposes on cleanup
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
