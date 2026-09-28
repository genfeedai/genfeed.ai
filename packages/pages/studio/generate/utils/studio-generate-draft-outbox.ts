import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftSaveStatus,
} from '@pages/studio/generate/types';
import { logger } from '@services/core/logger.service';

export type StudioGenerateDraftWrite = (
  brandId: string,
  payload: StudioGenerateDraftPayload,
  options: { isKeepalive: boolean },
) => Promise<unknown>;

export type StudioGenerateDraftStatusListener = (
  status: StudioGenerateDraftSaveStatus,
) => void;

export interface StudioGenerateDraftOutboxOptions {
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface StudioGenerateDraftOutbox {
  /**
   * Queues the brand's latest composer. Only the newest payload per brand is
   * kept; writes are serialized and each landed write is followed by another
   * if the queued composer still differs from what the server acknowledged.
   */
  enqueue: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
    options: { isKeepalive?: boolean; write: StudioGenerateDraftWrite },
  ) => void;
  /** What the server holds for the brand, e.g. the draft a load returned. */
  setAcknowledged: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
  ) => void;
  subscribe: (
    brandId: string,
    listener: StudioGenerateDraftStatusListener,
  ) => () => void;
  /** Resolves once no write for the brand is in flight. */
  whenIdle: (brandId: string) => Promise<void>;
}

interface BrandQueue {
  acknowledgedKey: string | null;
  idleWaiters: Array<() => void>;
  isDraining: boolean;
  isKeepaliveRequested: boolean;
  listeners: Set<StudioGenerateDraftStatusListener>;
  pending: { key: string; payload: StudioGenerateDraftPayload } | null;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  write: StudioGenerateDraftWrite | null;
}

const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 30_000;

/** Key order matches the composer's payload so equal content compares equal. */
export function serializeStudioGenerateDraftPayload(
  payload: StudioGenerateDraftPayload,
): string {
  return JSON.stringify({
    attachments: payload.attachments,
    knowledgeSelection: payload.knowledgeSelection,
    prompt: payload.prompt,
    references: payload.references,
    settingsByType: payload.settingsByType,
    type: payload.type,
  });
}

/**
 * Per-brand draft outbox. It lives outside React on purpose: a write queued
 * as the Generate workspace unmounts (in-app navigation, brand switch) still
 * lands, in order, after any write already in flight.
 */
export function createStudioGenerateDraftOutbox({
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
}: StudioGenerateDraftOutboxOptions = {}): StudioGenerateDraftOutbox {
  const queues = new Map<string, BrandQueue>();

  function queueFor(brandId: string): BrandQueue {
    let queue = queues.get(brandId);
    if (!queue) {
      queue = {
        acknowledgedKey: null,
        idleWaiters: [],
        isDraining: false,
        isKeepaliveRequested: false,
        listeners: new Set(),
        pending: null,
        retryAttempt: 0,
        retryTimer: null,
        write: null,
      };
      queues.set(brandId, queue);
    }
    return queue;
  }

  function notify(
    queue: BrandQueue,
    status: StudioGenerateDraftSaveStatus,
  ): void {
    for (const listener of queue.listeners) {
      listener(status);
    }
  }

  function clearRetry(queue: BrandQueue): void {
    if (queue.retryTimer !== null) {
      clearTimeout(queue.retryTimer);
      queue.retryTimer = null;
    }
  }

  function settleIdle(queue: BrandQueue): void {
    if (queue.isDraining) {
      return;
    }
    const waiters = queue.idleWaiters;
    queue.idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }

  async function drain(brandId: string): Promise<void> {
    const queue = queueFor(brandId);
    if (queue.isDraining) {
      return;
    }
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
        notify(queue, 'saving');
        try {
          await queue.write(brandId, next.payload, { isKeepalive });
        } catch (error) {
          logger.error('Failed to save the Studio composer draft', error);
          notify(queue, 'error');
          const delay = Math.min(
            retryBaseMs * 2 ** queue.retryAttempt,
            retryMaxMs,
          );
          queue.retryAttempt += 1;
          queue.retryTimer = setTimeout(() => {
            queue.retryTimer = null;
            void drain(brandId);
          }, delay);
          return;
        }

        queue.acknowledgedKey = next.key;
        queue.retryAttempt = 0;
        if (queue.pending === next) {
          queue.pending = null;
        }
        notify(queue, 'saved');
      }
    } finally {
      queue.isDraining = false;
      settleIdle(queue);
    }
  }

  return {
    enqueue(brandId, payload, { isKeepalive = false, write }) {
      const queue = queueFor(brandId);
      const key = serializeStudioGenerateDraftPayload(payload);
      queue.write = write;

      if (!queue.isDraining && key === queue.acknowledgedKey) {
        // Back to what the server holds: nothing left to write or retry.
        queue.pending = null;
        clearRetry(queue);
        return;
      }

      queue.pending = { key, payload };
      if (isKeepalive) {
        queue.isKeepaliveRequested = true;
      }
      // New content is worth trying now rather than after the backoff.
      clearRetry(queue);
      void drain(brandId);
    },

    setAcknowledged(brandId, payload) {
      queueFor(brandId).acknowledgedKey =
        serializeStudioGenerateDraftPayload(payload);
    },

    subscribe(brandId, listener) {
      const queue = queueFor(brandId);
      queue.listeners.add(listener);
      return () => {
        queue.listeners.delete(listener);
      };
    },

    whenIdle(brandId) {
      const queue = queueFor(brandId);
      if (!queue.isDraining) {
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        queue.idleWaiters.push(resolve);
      });
    },
  };
}

/** The app-wide outbox the Generate workspace writes its drafts through. */
export const studioGenerateDraftOutbox = createStudioGenerateDraftOutbox();
