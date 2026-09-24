import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import {
  createComposerFollowUp,
  enqueueComposerFollowUp,
  getComposerFollowUpQueue,
  getComposerFollowUpThreadKey,
  getOldestDispatchableComposerFollowUp,
  hasFailedComposerFollowUp,
  hasSendingComposerFollowUp,
  markComposerFollowUpStatus,
  migrateUnassignedComposerFollowUpQueue,
  moveComposerFollowUp,
  removeComposerFollowUp,
  setComposerFollowUpQueue,
  UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY,
} from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { useCallback, useEffect, useRef, useState } from 'react';

export type ComposerFollowUpEnqueueResult = {
  accepted: boolean;
  reason?: 'empty' | 'capacity' | 'blocked';
};

export type ComposerQueueState =
  | 'idle'
  | 'generating'
  | 'generating-queued'
  | 'interrupting'
  | 'dispatch-failed';

type UseComposerFollowUpQueueOptions = {
  canAutoDispatch: boolean;
  isBusy: boolean;
  isReadOnly?: boolean;
  onDispatch: (item: ComposerFollowUp) => Promise<boolean> | boolean;
  onInterrupt: () => Promise<boolean> | boolean;
  threadId: string | null;
};

export function useComposerFollowUpQueue({
  canAutoDispatch,
  isBusy,
  isReadOnly = false,
  onDispatch,
  onInterrupt,
  threadId,
}: UseComposerFollowUpQueueOptions) {
  const [queuesByThread, setQueuesByThread] = useState<
    Record<string, ComposerFollowUp[]>
  >({});
  const [isInterrupting, setIsInterrupting] = useState(false);
  const threadKey = getComposerFollowUpThreadKey(threadId);
  const previousThreadKeyRef = useRef(threadKey);
  const pendingPromoteIdRef = useRef<{
    id: string;
    threadId: string | null;
  } | null>(null);
  const dispatchingIdRef = useRef<string | null>(null);
  const autoDispatchLatchRef = useRef<string | null>(null);
  const onDispatchRef = useRef(onDispatch);
  const onInterruptRef = useRef(onInterrupt);
  onDispatchRef.current = onDispatch;
  onInterruptRef.current = onInterrupt;

  if (previousThreadKeyRef.current !== threadKey) {
    const previousKey = previousThreadKeyRef.current;
    previousThreadKeyRef.current = threadKey;
    autoDispatchLatchRef.current = null;
    if (
      previousKey === UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY &&
      threadId &&
      (queuesByThread[previousKey]?.length ?? 0) > 0
    ) {
      setQueuesByThread((current) =>
        migrateUnassignedComposerFollowUpQueue(current, threadId),
      );
    }
  }

  const queue = getComposerFollowUpQueue(queuesByThread, threadId);
  const queuesByThreadRef = useRef(queuesByThread);
  const threadIdRef = useRef(threadId);
  queuesByThreadRef.current = queuesByThread;
  threadIdRef.current = threadId;

  const dispatch = useCallback(
    async (id: string): Promise<boolean> => {
      if (isReadOnly || dispatchingIdRef.current) {
        return false;
      }

      const dispatchThreadId = threadIdRef.current;
      const snapshot = getComposerFollowUpQueue(
        queuesByThreadRef.current,
        dispatchThreadId,
      );
      const item = snapshot.find((entry) => entry.id === id);
      if (!item || item.status === 'sending') {
        return false;
      }

      dispatchingIdRef.current = id;
      setQueuesByThread((current) =>
        setComposerFollowUpQueue(
          current,
          dispatchThreadId,
          markComposerFollowUpStatus(
            getComposerFollowUpQueue(current, dispatchThreadId),
            id,
            'sending',
          ),
        ),
      );

      const sendingItem = { ...item, status: 'sending' as const };
      let accepted = false;
      try {
        accepted = await onDispatchRef.current(sendingItem);
      } catch {
        accepted = false;
      }

      setQueuesByThread((current) => {
        // A new draft may migrate while acknowledgement is pending. The item
        // identity names that one queue, never the currently visible thread.
        const settledKey = Object.keys(current).find((key) =>
          current[key]?.some((entry) => entry.id === id),
        );
        const settledThreadId =
          settledKey === UNASSIGNED_COMPOSER_FOLLOW_UP_THREAD_KEY
            ? null
            : (settledKey ?? dispatchThreadId);
        const currentQueue = getComposerFollowUpQueue(current, settledThreadId);
        const nextQueue = accepted
          ? removeComposerFollowUp(currentQueue, id)
          : markComposerFollowUpStatus(currentQueue, id, 'failed');
        return setComposerFollowUpQueue(current, settledThreadId, nextQueue);
      });
      dispatchingIdRef.current = null;
      return accepted;
    },
    [isReadOnly],
  );

  const enqueue = useCallback(
    (
      content: string,
      extras?: Pick<ComposerFollowUp, 'attachments' | 'mentions' | 'options'>,
    ): ComposerFollowUpEnqueueResult => {
      if (isReadOnly) {
        return { accepted: false, reason: 'blocked' };
      }

      const item = createComposerFollowUp(content, {
        ...extras,
        threadId,
      });
      const snapshot = enqueueComposerFollowUp(
        getComposerFollowUpQueue(queuesByThreadRef.current, threadId),
        item,
      );
      if (!snapshot.accepted) {
        return { accepted: false, reason: snapshot.reason };
      }

      setQueuesByThread((current) => {
        const enqueued = enqueueComposerFollowUp(
          getComposerFollowUpQueue(current, threadId),
          item,
        );
        if (!enqueued.accepted) {
          return current;
        }
        return setComposerFollowUpQueue(current, threadId, enqueued.queue);
      });
      return { accepted: true };
    },
    [isReadOnly, threadId],
  );

  const remove = useCallback(
    (id: string) => {
      setQueuesByThread((current) =>
        setComposerFollowUpQueue(
          current,
          threadId,
          removeComposerFollowUp(
            getComposerFollowUpQueue(current, threadId),
            id,
          ),
        ),
      );
    },
    [threadId],
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      setQueuesByThread((current) =>
        setComposerFollowUpQueue(
          current,
          threadId,
          moveComposerFollowUp(
            getComposerFollowUpQueue(current, threadId),
            fromIndex,
            toIndex,
          ),
        ),
      );
    },
    [threadId],
  );

  const retry = useCallback(
    (id: string) => {
      if (isReadOnly || isInterrupting || dispatchingIdRef.current) {
        return;
      }

      setQueuesByThread((current) =>
        setComposerFollowUpQueue(
          current,
          threadId,
          markComposerFollowUpStatus(
            getComposerFollowUpQueue(current, threadId),
            id,
            'queued',
          ),
        ),
      );

      if (!isBusy) {
        void dispatch(id);
      }
    },
    [dispatch, isBusy, isInterrupting, isReadOnly, threadId],
  );

  const sendNow = useCallback(
    (id: string) => {
      if (isReadOnly || isInterrupting || dispatchingIdRef.current) {
        return;
      }

      const item = queue.find((entry) => entry.id === id);
      if (!item || item.status === 'sending') {
        return;
      }

      if (!isBusy) {
        void dispatch(id);
        return;
      }

      pendingPromoteIdRef.current = { id, threadId };
      setIsInterrupting(true);
      void Promise.resolve(onInterruptRef.current()).then((cancelled) => {
        if (cancelled) {
          return;
        }
        pendingPromoteIdRef.current = null;
        setIsInterrupting(false);
      });
    },
    [dispatch, isBusy, isInterrupting, isReadOnly, queue, threadId],
  );

  const promoteOldest = useCallback(() => {
    const oldest = queue[0];
    if (!oldest) {
      return;
    }
    sendNow(oldest.id);
  }, [queue, sendNow]);

  useEffect(() => {
    if (!isInterrupting) {
      return;
    }
    if (isBusy) {
      return;
    }

    const pendingId = pendingPromoteIdRef.current;
    pendingPromoteIdRef.current = null;
    setIsInterrupting(false);
    if (pendingId && pendingId.threadId === threadIdRef.current) {
      void dispatch(pendingId.id);
    }
  }, [dispatch, isBusy, isInterrupting]);

  useEffect(() => {
    if (!canAutoDispatch || isReadOnly || isInterrupting) {
      autoDispatchLatchRef.current = null;
      return;
    }

    if (autoDispatchLatchRef.current || dispatchingIdRef.current) {
      return;
    }

    const next = getOldestDispatchableComposerFollowUp(queue);
    if (!next) {
      return;
    }

    autoDispatchLatchRef.current = next.id;
    void dispatch(next.id);
  }, [canAutoDispatch, dispatch, isInterrupting, isReadOnly, queue]);

  const queueState: ComposerQueueState = isInterrupting
    ? 'interrupting'
    : hasFailedComposerFollowUp(queue)
      ? 'dispatch-failed'
      : isBusy && queue.length > 0
        ? 'generating-queued'
        : isBusy
          ? 'generating'
          : 'idle';

  return {
    enqueue,
    isInterrupting,
    move,
    promoteOldest,
    queue,
    queueState,
    remove,
    retry,
    sendNow,
    hasSending: hasSendingComposerFollowUp(queue),
  };
}
