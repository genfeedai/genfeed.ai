'use client';

import type { SocketResult } from '@cloud/interfaces/content/generation-payload.interface';
import type { IngredientCategory } from '@genfeedai/enums';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { createMediaHandler } from '@services/core/socket-manager.service';
import { WebSocketPaths } from '@utils/network/websocket.util';
import { useCallback, useEffect, useRef } from 'react';

export interface UseGenerationListenerOptions {
  onSuccess: (resolvedId: string, index: number) => void;
  onError?: (error: Error | string, index: number) => void;
  onBatchComplete?: () => void;
  onTimeout?: () => void;
  timeoutMs?: number;
  timeoutMessage?: string;
  errorMessage?: string;
  showErrorNotifications?: boolean;
}

interface ActiveGeneration {
  unsubscribe: () => void;
  timeoutId: NodeJS.Timeout;
  pendingId: string;
}

/**
 * Handles WebSocket generation responses for single or batch operations.
 * Manages subscriptions, timeouts, and cleanup automatically.
 */
export function useGenerationListener(options: UseGenerationListenerOptions) {
  const {
    onSuccess,
    onError,
    onBatchComplete,
    onTimeout,
    timeoutMs = 60000,
    timeoutMessage = 'Generation timed out. Please try again.',
    errorMessage = 'Generation failed. Please try again.',
    showErrorNotifications = true,
  } = options;

  const { subscribe } = useSocketManager();
  const activeGenerationsRef = useRef<Map<string, ActiveGeneration>>(new Map());
  const completedCountRef = useRef<number>(0);
  const totalExpectedRef = useRef<number>(0);

  const notificationsService = NotificationsService.getInstance();

  /**
   * Cleanup a specific generation subscription
   */
  const cleanupGeneration = useCallback((pendingId: string) => {
    const generation = activeGenerationsRef.current.get(pendingId);
    if (generation) {
      clearTimeout(generation.timeoutId);
      generation.unsubscribe();
      activeGenerationsRef.current.delete(pendingId);
    }
  }, []);

  /**
   * Cleanup all active generation subscriptions
   */
  const cleanupAllGenerations = useCallback(() => {
    activeGenerationsRef.current.forEach((generation) => {
      clearTimeout(generation.timeoutId);
      generation.unsubscribe();
    });
    activeGenerationsRef.current.clear();
    completedCountRef.current = 0;
    totalExpectedRef.current = 0;
  }, []);

  /**
   * Check if batch is complete and trigger callback
   */
  const checkBatchCompletion = useCallback(() => {
    if (
      onBatchComplete &&
      completedCountRef.current === totalExpectedRef.current &&
      totalExpectedRef.current > 0
    ) {
      onBatchComplete();
    }
  }, [onBatchComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAllGenerations();
    };
  }, [cleanupAllGenerations]);

  /**
   * Start listening for generation completion events
   *
   * @param pendingIds - Array of pending ingredient IDs to listen for
   * @param categoryType - The category type (IMAGE, VIDEO, MUSIC, etc.)
   * @returns Cleanup function to cancel all subscriptions
   */
  const listenForGeneration = useCallback(
    (pendingIds: string[], categoryType: IngredientCategory) => {
      // Clean up any existing subscriptions
      cleanupAllGenerations();

      // Initialize tracking
      totalExpectedRef.current = pendingIds.length;
      completedCountRef.current = 0;

      pendingIds.forEach((pendingId, index) => {
        const eventPath = WebSocketPaths[
          `${categoryType.toLowerCase()}` as keyof typeof WebSocketPaths
        ] as (id: string) => string;
        const event = eventPath(pendingId);

        const timeoutId = setTimeout(() => {
          logger.error(`Generation timed out for ${categoryType}`, {
            index,
            pendingId,
          });

          if (showErrorNotifications) {
            notificationsService.error(timeoutMessage);
          }

          completedCountRef.current += 1;

          if (onTimeout) {
            onTimeout();
          } else if (onError) {
            onError(new Error('Timeout'), index);
          }

          cleanupGeneration(pendingId);
          checkBatchCompletion();
        }, timeoutMs);

        const handler = createMediaHandler<SocketResult>(
          (result) => {
            logger.info(`Generation completed for ${categoryType}`, {
              index,
              pendingId,
              result,
            });

            const resolvedId =
              typeof result === 'string' ? result : result?.id || pendingId;

            completedCountRef.current += 1;
            cleanupGeneration(pendingId);
            onSuccess(resolvedId, index);
            checkBatchCompletion();
          },
          (error: string) => {
            logger.error(`Generation failed for ${categoryType}`, {
              error,
              index,
              pendingId,
            });

            if (showErrorNotifications) {
              notificationsService.error(error || errorMessage);
            }

            completedCountRef.current += 1;
            cleanupGeneration(pendingId);
            onError?.(error, index);
            checkBatchCompletion();
          },
        );

        const unsubscribe = subscribe(event, handler);

        activeGenerationsRef.current.set(pendingId, {
          pendingId,
          timeoutId,
          unsubscribe,
        });
      });

      return cleanupAllGenerations;
    },
    [
      cleanupAllGenerations,
      cleanupGeneration,
      checkBatchCompletion,
      errorMessage,
      notificationsService,
      onError,
      onSuccess,
      onTimeout,
      showErrorNotifications,
      subscribe,
      timeoutMessage,
      timeoutMs,
    ],
  );

  return listenForGeneration;
}
