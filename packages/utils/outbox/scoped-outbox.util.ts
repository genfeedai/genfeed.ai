import type {
  ScopedOutbox,
  ScopedOutboxConfig,
  ScopedOutboxOptions,
  ScopedOutboxQueue,
  ScopedOutboxStatus,
  ScopedOutboxStorage,
} from '@genfeedai/contracts/interfaces/utils/scoped-outbox.interface';
import { isRecord } from '../data/extract.util';

export const SCOPED_OUTBOX_IDLE_TIMEOUT_MS = 5000;
export const SCOPED_OUTBOX_RETRY_BASE_MS = 2000;
export const SCOPED_OUTBOX_RETRY_MAX_MS = 30_000;

function defaultStorage(): ScopedOutboxStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Generic per-scope offline write outbox. It lives outside React on purpose:
 * a write queued as a page unmounts still lands, in order, after any write
 * already in flight, and a write that was never sent is kept in storage for
 * the next load to restore and replay.
 */
export function createScopedOutbox<TPayload, TUnsent, TFailure extends string>(
  config: ScopedOutboxConfig<TPayload, TUnsent, TFailure>,
  {
    getStorage = defaultStorage,
    idleTimeoutMs = SCOPED_OUTBOX_IDLE_TIMEOUT_MS,
    retryBaseMs = SCOPED_OUTBOX_RETRY_BASE_MS,
    retryMaxMs = SCOPED_OUTBOX_RETRY_MAX_MS,
  }: ScopedOutboxOptions = {},
): ScopedOutbox<TPayload, TUnsent, TFailure> {
  type Queue = ScopedOutboxQueue<TPayload, TFailure>;
  const queues = new Map<string, Queue>();

  function storageKey(scopeId: string): string {
    return `${config.storageKeyPrefix}:${scopeId}`;
  }

  function queueFor(scopeId: string): Queue {
    let queue = queues.get(scopeId);
    if (!queue) {
      queue = {
        acknowledgedKey: null,
        drainPromise: null,
        idleWaiters: [],
        isDraining: false,
        isKeepaliveRequested: false,
        isWriting: false,
        listeners: new Set(),
        pending: null,
        retryAttempt: 0,
        retryTimer: null,
        status: 'idle',
        unacknowledgedSentKeys: new Set(),
        write: null,
      };
      queues.set(scopeId, queue);
    }
    return queue;
  }

  function clearUnsent(scopeId: string): void {
    try {
      getStorage()?.removeItem(storageKey(scopeId));
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  // Persistence is a safety net: a full or blocked store never breaks saving.
  function persistUnsent(scopeId: string, queue: Queue): void {
    const pending = queue.pending;
    if (!pending?.ownerId) {
      clearUnsent(scopeId);
      return;
    }
    try {
      const stored = config.toStored(
        { ownerId: pending.ownerId, payload: pending.payload },
        {
          baseKeys: [
            ...(queue.acknowledgedKey ? [queue.acknowledgedKey] : []),
            ...queue.unacknowledgedSentKeys,
          ],
        },
      );
      getStorage()?.setItem(storageKey(scopeId), JSON.stringify(stored));
    } catch {
      // The in-memory queue still holds the write.
    }
  }

  function setStatus(queue: Queue, status: ScopedOutboxStatus<TFailure>): void {
    queue.status = status;
    for (const listener of queue.listeners) {
      listener(status);
    }
  }

  function clearRetry(queue: Queue): void {
    if (queue.retryTimer !== null) {
      clearTimeout(queue.retryTimer);
      queue.retryTimer = null;
    }
  }

  function isIdle(queue: Queue): boolean {
    return !queue.isDraining && !queue.pending && queue.retryTimer === null;
  }

  function settleIdle(queue: Queue): void {
    if (!isIdle(queue)) {
      return;
    }
    const waiters = queue.idleWaiters;
    queue.idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  async function runDrain(scopeId: string): Promise<void> {
    const queue = queueFor(scopeId);
    queue.isDraining = true;

    try {
      while (queue.pending && queue.write) {
        const next = queue.pending;
        if (next.key === queue.acknowledgedKey) {
          queue.pending = null;
          break;
        }

        const isKeepalive = queue.isKeepaliveRequested;
        queue.isKeepaliveRequested = false;
        queue.unacknowledgedSentKeys.add(next.key);
        setStatus(queue, 'saving');
        queue.isWriting = true;
        try {
          await queue.write(scopeId, next.payload, {
            isKeepalive,
            ownerId: next.ownerId,
          });
        } catch (error) {
          queue.isWriting = false;
          const resolution = config.classifyFailure(error);
          if (resolution) {
            if (resolution.logMessage) {
              config.logError(resolution.logMessage, error);
            }
            queue.retryAttempt = 0;
            if (resolution.action === 'drop-all') {
              queue.pending = null;
            } else if (
              resolution.action === 'drop-write' &&
              queue.pending === next
            ) {
              queue.pending = null;
            }
            setStatus(queue, resolution.status);
            if (resolution.action === 'hold') {
              return;
            }
            continue;
          }
          config.logError(config.retryLogMessage, error);
          setStatus(queue, config.retryStatus);
          const delay = Math.min(
            retryBaseMs * 2 ** queue.retryAttempt,
            retryMaxMs,
          );
          queue.retryAttempt += 1;
          queue.retryTimer = setTimeout(() => {
            queue.retryTimer = null;
            void drain(scopeId);
          }, delay);
          return;
        }

        queue.isWriting = false;
        queue.acknowledgedKey = next.key;
        queue.unacknowledgedSentKeys.clear();
        queue.retryAttempt = 0;
        if (queue.pending === next) {
          queue.pending = null;
        }
        setStatus(queue, 'saved');
      }
      if (!queue.pending) {
        clearUnsent(scopeId);
      }
    } finally {
      queue.isDraining = false;
      queue.drainPromise = null;
      settleIdle(queue);
    }
  }

  function drain(scopeId: string): Promise<void> {
    const queue = queueFor(scopeId);
    if (queue.drainPromise) {
      return queue.drainPromise;
    }
    // Reserved before any subscriber or writer runs, so a reentrant enqueue
    // joins this drain instead of starting a second, overlapping one.
    let resolveDrain: () => void = () => {};
    let rejectDrain: (reason: unknown) => void = () => {};
    const promise = new Promise<void>((resolve, reject) => {
      resolveDrain = resolve;
      rejectDrain = reject;
    });
    queue.drainPromise = promise;
    runDrain(scopeId).then(resolveDrain, rejectDrain);
    return promise;
  }

  return {
    enqueue(scopeId, payload, { isKeepalive = false, ownerId = null, write }) {
      const queue = queueFor(scopeId);
      const key = config.serialize(payload);
      queue.write = write;

      if (!queue.isDraining && key === queue.acknowledgedKey) {
        // Back to what the server holds (an undo): nothing left to write.
        const hadWork =
          queue.pending !== null || queue.status === config.retryStatus;
        queue.pending = null;
        clearRetry(queue);
        clearUnsent(scopeId);
        if (config.markSavedOnRevert && hadWork) {
          setStatus(queue, 'saved');
        }
        settleIdle(queue);
        return;
      }

      queue.pending = { key, ownerId, payload };
      persistUnsent(scopeId, queue);
      if (isKeepalive) {
        queue.isKeepaliveRequested = true;
      }
      // New content is worth trying now rather than after the backoff.
      clearRetry(queue);
      void drain(scopeId);
    },

    discardForeign(ownerId) {
      // Stored copies need no sweep: `readUnsent` only returns the owner's.
      for (const queue of queues.values()) {
        if (queue.pending && queue.pending.ownerId !== ownerId) {
          queue.pending = null;
          clearRetry(queue);
          settleIdle(queue);
        }
      }
    },

    discardUnsent(scopeId) {
      clearUnsent(scopeId);
    },

    getStatus(scopeId) {
      return queueFor(scopeId).status;
    },

    hasUnsavedWrites(scopeId) {
      const queue = queues.get(scopeId);
      return Boolean(queue && (queue.pending || queue.isWriting));
    },

    readUnsent(scopeId, ownerId) {
      try {
        const raw = getStorage()?.getItem(storageKey(scopeId));
        if (!raw) {
          return null;
        }
        const stored: unknown = JSON.parse(raw);
        if (!isRecord(stored) || stored.ownerId !== ownerId) {
          return null;
        }
        return config.fromStored(stored);
      } catch {
        return null;
      }
    },

    setAcknowledged(scopeId, payload) {
      const queue = queueFor(scopeId);
      queue.acknowledgedKey = config.serialize(payload);
      queue.unacknowledgedSentKeys.clear();
    },

    async settle(scopeId) {
      const queue = queueFor(scopeId);
      clearRetry(queue);
      await drain(scopeId);
      // A write that failed stops the drain; one more attempt answers whether
      // the write can land now instead of after the backoff.
      while (
        queue.pending &&
        queue.status !== config.retryStatus &&
        !queue.isDraining
      ) {
        await drain(scopeId);
      }
      return queue.status;
    },

    subscribe(scopeId, listener) {
      const queue = queueFor(scopeId);
      queue.listeners.add(listener);
      return () => {
        queue.listeners.delete(listener);
      };
    },

    whenIdle(scopeId) {
      const queue = queueFor(scopeId);
      if (isIdle(queue)) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const settled = () => {
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(() => {
          queue.idleWaiters = queue.idleWaiters.filter(
            (waiter) => waiter !== settled,
          );
          reject(
            new Error(
              config.idleTimeoutMessage ??
                'Outbox acknowledgement timed out; unsent content is retained',
            ),
          );
        }, idleTimeoutMs);
        queue.idleWaiters.push(settled);
      });
    },
  };
}
