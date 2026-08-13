import type { ComposerFollowUp } from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import {
  createComposerFollowUp,
  enqueueComposerFollowUp,
  moveComposerFollowUp,
  removeComposerFollowUp,
  takeNextComposerFollowUp,
} from '@genfeedai/agent/utils/composer-follow-up-queue.util';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseComposerFollowUpQueueOptions = {
  isIdle: boolean;
  onFlush: (item: ComposerFollowUp) => void;
  threadId: string | null;
};

export function useComposerFollowUpQueue({
  isIdle,
  onFlush,
  threadId,
}: UseComposerFollowUpQueueOptions) {
  const [queue, setQueue] = useState<ComposerFollowUp[]>([]);
  const [queueThreadId, setQueueThreadId] = useState(threadId);
  const flushingIdRef = useRef<string | null>(null);
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  if (queueThreadId !== threadId) {
    setQueueThreadId(threadId);
    setQueue([]);
    flushingIdRef.current = null;
  }

  const enqueue = useCallback(
    (
      content: string,
      extras?: Pick<ComposerFollowUp, 'attachments' | 'options'>,
    ) => {
      const item = createComposerFollowUp(content, extras);
      setQueue((current) => enqueueComposerFollowUp(current, item));
      return item;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setQueue((current) => removeComposerFollowUp(current, id));
  }, []);

  const move = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((current) => moveComposerFollowUp(current, fromIndex, toIndex));
  }, []);

  const sendNow = useCallback(
    (id: string) => {
      const match = queue.find((item) => item.id === id);
      if (!match) {
        return;
      }
      setQueue((current) => removeComposerFollowUp(current, id));
      onFlushRef.current(match);
    },
    [queue],
  );

  useEffect(() => {
    if (!isIdle) {
      flushingIdRef.current = null;
      return;
    }

    // One follow-up per idle cycle. sendMessage starts a run asynchronously;
    // without this latch the remaining queue would drain in the same tick.
    if (flushingIdRef.current) {
      return;
    }

    const { next, remaining } = takeNextComposerFollowUp(queue);
    if (!next) {
      return;
    }

    flushingIdRef.current = next.id;
    setQueue(remaining);
    onFlushRef.current(next);
  }, [isIdle, queue]);

  return {
    enqueue,
    move,
    queue,
    remove,
    sendNow,
  };
}
