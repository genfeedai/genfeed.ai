import type { SaveQueue } from '@genfeedai/contracts/interfaces/hooks/use-save-queue.interface';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Serializes autosave writes onto a single promise chain.
 *
 * Guarding re-entrancy with a bare early return resolves the caller
 * successfully without saving anything, so an inline editor exits edit mode and
 * the edit is silently lost. Queuing instead means every enqueued save runs —
 * just never concurrently — and each caller observes its own outcome.
 */
export function useSaveQueue(): SaveQueue {
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const pendingCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const enqueueSave = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    pendingCountRef.current += 1;
    setIsSaving(true);

    // The task runs at dequeue time, not enqueue time, so it reads whatever
    // state the preceding save left behind.
    const queuedSave = queueRef.current.then(task);

    const settle = (): void => {
      pendingCountRef.current -= 1;

      if (pendingCountRef.current === 0 && isMountedRef.current) {
        setIsSaving(false);
      }
    };

    // Swallowing here keeps a failed save from poisoning the rest of the chain;
    // `queuedSave` itself still rejects for the caller.
    queueRef.current = queuedSave.then(settle, settle);

    return queuedSave;
  }, []);

  const waitForIdle = useCallback(async (): Promise<void> => {
    await queueRef.current;
  }, []);

  return { enqueueSave, isSaving, waitForIdle };
}
