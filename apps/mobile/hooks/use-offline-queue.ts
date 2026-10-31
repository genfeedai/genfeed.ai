import { useCallback, useEffect, useState } from 'react';
import {
  offlineQueueService,
  type QueueActionType,
  type QueuedAction,
} from '@/services/offline-queue.service';

export type { QueueActionType, QueuedAction };

interface AddToQueueParams {
  type: QueueActionType;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload?: Record<string, unknown>;
}

const QUEUE_UPDATE_EVENTS = [
  'actionQueued',
  'actionProcessed',
  'actionFailed',
  'actionRemoved',
  'queueCleared',
] as const;

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>(
    offlineQueueService.getQueue(),
  );
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    offlineQueueService.init();

    const updateQueue = () => setQueue(offlineQueueService.getQueue());
    const handleProcessingStarted = () => setIsProcessing(true);
    const handleProcessingComplete = () => {
      setIsProcessing(false);
      updateQueue();
    };

    // Subscribe to queue update events
    QUEUE_UPDATE_EVENTS.forEach((event) => {
      offlineQueueService.on(event, updateQueue);
    });
    offlineQueueService.on('processingStarted', handleProcessingStarted);
    offlineQueueService.on('processingComplete', handleProcessingComplete);

    return () => {
      QUEUE_UPDATE_EVENTS.forEach((event) => {
        offlineQueueService.off(event, updateQueue);
      });
      offlineQueueService.off('processingStarted', handleProcessingStarted);
      offlineQueueService.off('processingComplete', handleProcessingComplete);
    };
  }, []);

  const addToQueue = useCallback(
    (action: AddToQueueParams) => offlineQueueService.addAction(action),
    [],
  );

  const processQueue = useCallback(
    () => offlineQueueService.processQueue(),
    [],
  );

  const clearQueue = useCallback(() => offlineQueueService.clearQueue(), []);

  const removeFromQueue = useCallback(
    (id: string) => offlineQueueService.removeAction(id),
    [],
  );

  return {
    addToQueue,
    clearQueue,
    isProcessing,
    processQueue,
    queue,
    queueLength: queue.length,
    removeFromQueue,
  };
}
