import type {
  StudioGenerateDraftPayload,
  StudioGenerateDraftSaveStatus,
} from '@pages/studio/generate/types';
import { logger } from '@services/core/logger.service';

export type StudioGenerateDraftWrite = (
  brandId: string,
  payload: StudioGenerateDraftPayload,
  options: { isKeepalive: boolean; ownerId: string | null },
) => Promise<unknown>;

/**
 * Thrown by a draft write the server will never accept (a 4xx rejection, or
 * a payload queued by a user who is no longer signed in here). The outbox
 * drops that write instead of retrying it.
 */
export class StudioGenerateDraftRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioGenerateDraftRejectedError';
  }
}

export type StudioGenerateDraftStatusListener = (
  status: StudioGenerateDraftSaveStatus,
) => void;

/** The slice of `Storage` the outbox persists unsent drafts through. */
export type StudioGenerateDraftStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'setItem'
>;

export interface StudioGenerateDraftOutboxOptions {
  /** Resolved on every use, so server rendering never touches `window`. */
  getStorage?: () => StudioGenerateDraftStorage | null;
  /** Maximum wait for acknowledgement; timing out keeps the queue recoverable. */
  idleTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface StudioGenerateDraftOutbox {
  /**
   * Queues the brand's latest composer. Only the newest payload per brand is
   * kept; writes are serialized and each landed write is followed by another
   * if the queued composer still differs from what the server acknowledged.
   * With an `ownerId`, the unsent payload is also kept in storage until the
   * server acknowledges it, so a page teardown mid-queue cannot lose it.
   */
  enqueue: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
    options: {
      isKeepalive?: boolean;
      ownerId?: string | null;
      write: StudioGenerateDraftWrite;
    },
  ) => void;
  /** Drops every queued write another user left behind in this tab. */
  discardForeign: (ownerId: string) => void;
  /** An unsent payload a previous page left for this brand and user. */
  readUnsent: (
    brandId: string,
    ownerId: string,
  ) => StudioGenerateDraftPayload | null;
  /** What the server holds for the brand, e.g. the draft a load returned. */
  setAcknowledged: (
    brandId: string,
    payload: StudioGenerateDraftPayload,
  ) => void;
  subscribe: (
    brandId: string,
    listener: StudioGenerateDraftStatusListener,
  ) => () => void;
  /**
   * Resolves once the brand has nothing in flight, queued, or waiting on a
   * retry — the server then holds the latest composer written for it.
   * Rejects after the idle deadline so restoration can retry without reading
   * an older server draft over unsent content. The write/retry queue is kept.
   */
  whenIdle: (brandId: string) => Promise<void>;
}

interface BrandQueue {
  acknowledgedKey: string | null;
  idleWaiters: Array<() => void>;
  isDraining: boolean;
  isKeepaliveRequested: boolean;
  listeners: Set<StudioGenerateDraftStatusListener>;
  pending: {
    key: string;
    ownerId: string | null;
    payload: StudioGenerateDraftPayload;
  } | null;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  write: StudioGenerateDraftWrite | null;
}

interface StoredUnsentDraft {
  ownerId: string;
  payload: StudioGenerateDraftPayload;
}

export const STUDIO_GENERATE_DRAFT_IDLE_TIMEOUT_MS = 5000;

const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 30_000;
export const STUDIO_GENERATE_DRAFT_OUTBOX_STORAGE_PREFIX =
  'genfeed.studio.generate.draft-outbox.v1';

function storageKey(brandId: string): string {
  return `${STUDIO_GENERATE_DRAFT_OUTBOX_STORAGE_PREFIX}:${brandId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDraftPayload(value: unknown): value is StudioGenerateDraftPayload {
  return (
    isRecord(value) &&
    typeof value.prompt === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.references) &&
    Array.isArray(value.attachments) &&
    isRecord(value.settingsByType) &&
    isRecord(value.knowledgeSelection)
  );
}

function defaultStorage(): StudioGenerateDraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

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
 * lands, in order, after any write already in flight — and a write the page
 * never got to send is replayed by the next Generate load.
 */
export function createStudioGenerateDraftOutbox({
  getStorage = defaultStorage,
  idleTimeoutMs = STUDIO_GENERATE_DRAFT_IDLE_TIMEOUT_MS,
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

  // Persistence is a safety net: a full or blocked store never breaks saving.
  function persistUnsent(
    brandId: string,
    ownerId: string,
    payload: StudioGenerateDraftPayload,
  ): void {
    try {
      const stored: StoredUnsentDraft = { ownerId, payload };
      getStorage()?.setItem(storageKey(brandId), JSON.stringify(stored));
    } catch {
      // The in-memory queue still holds the payload.
    }
  }

  function clearUnsent(brandId: string): void {
    try {
      getStorage()?.removeItem(storageKey(brandId));
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
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

  function isIdle(queue: BrandQueue): boolean {
    return !queue.isDraining && !queue.pending && queue.retryTimer === null;
  }

  function settleIdle(queue: BrandQueue): void {
    if (!isIdle(queue)) {
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
          await queue.write(brandId, next.payload, {
            isKeepalive,
            ownerId: next.ownerId,
          });
        } catch (error) {
          if (error instanceof StudioGenerateDraftRejectedError) {
            // Retrying cannot help: drop this write and move on to anything
            // newer that was queued meanwhile.
            logger.error('Studio composer draft was rejected', error);
            queue.retryAttempt = 0;
            if (queue.pending === next) {
              queue.pending = null;
            }
            notify(queue, 'failed');
            continue;
          }
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
      if (!queue.pending) {
        clearUnsent(brandId);
      }
    } finally {
      queue.isDraining = false;
      settleIdle(queue);
    }
  }

  return {
    enqueue(brandId, payload, { isKeepalive = false, ownerId = null, write }) {
      const queue = queueFor(brandId);
      const key = serializeStudioGenerateDraftPayload(payload);
      queue.write = write;

      if (!queue.isDraining && key === queue.acknowledgedKey) {
        // Back to what the server holds: nothing left to write or retry.
        queue.pending = null;
        clearRetry(queue);
        clearUnsent(brandId);
        settleIdle(queue);
        return;
      }

      queue.pending = { key, ownerId, payload };
      if (ownerId) {
        persistUnsent(brandId, ownerId, payload);
      } else {
        clearUnsent(brandId);
      }
      if (isKeepalive) {
        queue.isKeepaliveRequested = true;
      }
      // New content is worth trying now rather than after the backoff.
      clearRetry(queue);
      void drain(brandId);
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

    readUnsent(brandId, ownerId) {
      try {
        const raw = getStorage()?.getItem(storageKey(brandId));
        if (!raw) {
          return null;
        }
        const stored: unknown = JSON.parse(raw);
        if (
          !isRecord(stored) ||
          stored.ownerId !== ownerId ||
          !isDraftPayload(stored.payload)
        ) {
          return null;
        }
        return stored.payload;
      } catch {
        return null;
      }
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
              'Studio draft acknowledgement timed out; unsent content is retained',
            ),
          );
        }, idleTimeoutMs);
        queue.idleWaiters.push(settled);
      });
    },
  };
}

/** The app-wide outbox the Generate workspace writes its drafts through. */
export const studioGenerateDraftOutbox = createStudioGenerateDraftOutbox();
