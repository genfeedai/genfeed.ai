'use client';

import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createPromptHandler } from '@services/core/socket-manager.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef } from 'react';

export interface UseWebsocketPromptOptions<T = unknown> {
  onSuccess: (result: T) => void;
  onError?: (error: Error | string) => void;
  onTimeout?: () => void;
  timeoutMs?: number;
  timeoutMessage?: string;
  errorMessage?: string;
}

/**
 * Hook for handling websocket prompt responses with built-in error handling and timeout
 *
 * @param options Configuration for the websocket prompt handler
 * @returns Function to start listening for websocket responses
 *
 * @example
 * ```tsx
 * const listenForPrompt = useWebsocketPrompt({
 *   onSuccess: (result) => {
 *     form.setValue('text', result);
 *     setIsLoading(false);
 *   },
 *   onError: () => setIsLoading(false),
 *   timeoutMs: 30000
 * });
 *
 * // Use it after making a prompt API call
 * const response = await promptService.post(data);
 * listenForPrompt(response.id);
 * ```
 */
export function useWebsocketPrompt<T = unknown>(
  options: UseWebsocketPromptOptions<T>,
) {
  const {
    onSuccess,
    onError,
    onTimeout,
    timeoutMs = 30000,
    timeoutMessage = 'Operation timed out. Please try again.',
    errorMessage = 'Operation failed. Please try again.',
  } = options;

  const { subscribe } = useSocketManager();
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const subscriptionRef = useRef<(() => void) | null>(null);

  const cleanupTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const cleanupSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
  }, []);

  const cleanupAll = useCallback(() => {
    cleanupTimeout();
    cleanupSubscription();
  }, [cleanupTimeout, cleanupSubscription]);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, [cleanupAll]);

  const listenForSocket = useCallback(
    (promptId: string) => {
      // Clean up any existing timeout
      cleanupAll();

      const event = WebSocketPaths.prompt(promptId);
      const notificationsService = NotificationsService.getInstance();

      // Set up timeout handler
      timeoutRef.current = setTimeout(() => {
        logger.error(`Websocket prompt timed out for ${promptId}`);
        notificationsService.error(timeoutMessage);

        if (onTimeout) {
          onTimeout();
        } else if (onError) {
          onError(new Error('Timeout'));
        }

        cleanupAll();
      }, timeoutMs);

      // Create websocket handler with error callback
      const handler = createPromptHandler<T>(
        (result: T) => {
          cleanupAll();
          onSuccess(result);
        },
        (error: string) => {
          cleanupAll();
          logger.error('Websocket prompt failed', { error, promptId });
          notificationsService.error(errorMessage);

          if (onError) {
            onError(error);
          }
        },
      );

      // Subscribe to websocket event
      cleanupSubscription();
      subscriptionRef.current = subscribe(event, handler);
    },
    [
      cleanupAll,
      cleanupSubscription,
      errorMessage,
      onError,
      onSuccess,
      onTimeout,
      subscribe,
      timeoutMessage,
      timeoutMs,
    ],
  );

  return listenForSocket;
}
