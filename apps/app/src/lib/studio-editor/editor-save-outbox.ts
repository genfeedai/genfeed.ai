import type {
  EditorProjectContent,
  EditorSaveOutbox,
  EditorSaveOutboxOptions,
  EditorSaveStatus,
  EditorSaveStatusListener,
  EditorSaveStorage,
  EditorSaveWrite,
  EditorUnsentEdit,
} from '@props/studio/editor-save.props';
import { logger } from '@services/core/logger.service';

/**
 * Thrown by a write the server will never accept as sent (a 4xx other than
 * the locked-project conflict, or an edit queued by a user who is no longer
 * signed in here). The edit stays queued and stored, but is not retried on a
 * timer: only a new edit or an explicit save tries it again.
 */
export class EditorSaveRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorSaveRejectedError';
  }
}

/** The server refuses every update to this project (409): it is locked. */
export class EditorSaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorSaveConflictError';
  }
}

interface PendingEdit {
  content: EditorProjectContent;
  key: string;
  ownerId: string | null;
}

interface ProjectQueue {
  acknowledgedKey: string | null;
  drainPromise: Promise<void> | null;
  isDraining: boolean;
  isKeepaliveRequested: boolean;
  isWriting: boolean;
  listeners: Set<EditorSaveStatusListener>;
  pending: PendingEdit | null;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  status: EditorSaveStatus;
  /** Sent since the last acknowledgement; the server may hold any of them. */
  unacknowledgedSentKeys: Set<string>;
  write: EditorSaveWrite | null;
}

interface StoredUnsentEdit extends EditorUnsentEdit {
  ownerId: string;
}

const DEFAULT_RETRY_BASE_MS = 2000;
const DEFAULT_RETRY_MAX_MS = 30_000;
export const EDITOR_SAVE_OUTBOX_STORAGE_PREFIX =
  'genfeed.studio.editor.save-outbox.v1';

function storageKey(projectId: string): string {
  return `${EDITOR_SAVE_OUTBOX_STORAGE_PREFIX}:${projectId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProjectContent(value: unknown): value is EditorProjectContent {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isRecord(value.settings) &&
    typeof value.totalDurationFrames === 'number' &&
    Array.isArray(value.tracks)
  );
}

function defaultStorage(): EditorSaveStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, sortKeysDeep(value[key])]),
    );
  }
  return value;
}

/**
 * Key order is normalized: the server stores tracks as JSONB, which does not
 * keep insertion order, so equal content must compare equal after a round trip.
 */
export function serializeEditorProjectContent(
  content: EditorProjectContent,
): string {
  return JSON.stringify(
    sortKeysDeep({
      name: content.name,
      settings: content.settings,
      totalDurationFrames: content.totalDurationFrames,
      tracks: content.tracks,
    }),
  );
}

/**
 * Per-project save outbox. It lives outside React on purpose: a write queued
 * as the Editor unmounts (in-app navigation) still lands, in order, after any
 * write already in flight — and an edit the page never got to send is kept in
 * storage for the next Editor load to restore and replay.
 */
export function createEditorSaveOutbox({
  getStorage = defaultStorage,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
}: EditorSaveOutboxOptions = {}): EditorSaveOutbox {
  const queues = new Map<string, ProjectQueue>();

  function queueFor(projectId: string): ProjectQueue {
    let queue = queues.get(projectId);
    if (!queue) {
      queue = {
        acknowledgedKey: null,
        drainPromise: null,
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
      queues.set(projectId, queue);
    }
    return queue;
  }

  // Persistence is a safety net: a full or blocked store never breaks saving.
  function persistUnsent(projectId: string, queue: ProjectQueue): void {
    const pending = queue.pending;
    if (!pending?.ownerId) {
      clearUnsent(projectId);
      return;
    }
    try {
      const stored: StoredUnsentEdit = {
        baseKeys: [
          ...(queue.acknowledgedKey ? [queue.acknowledgedKey] : []),
          ...queue.unacknowledgedSentKeys,
        ],
        content: pending.content,
        ownerId: pending.ownerId,
      };
      getStorage()?.setItem(storageKey(projectId), JSON.stringify(stored));
    } catch {
      // The in-memory queue still holds the edit.
    }
  }

  function clearUnsent(projectId: string): void {
    try {
      getStorage()?.removeItem(storageKey(projectId));
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }

  function setStatus(queue: ProjectQueue, status: EditorSaveStatus): void {
    queue.status = status;
    for (const listener of queue.listeners) {
      listener(status);
    }
  }

  function clearRetry(queue: ProjectQueue): void {
    if (queue.retryTimer !== null) {
      clearTimeout(queue.retryTimer);
      queue.retryTimer = null;
    }
  }

  async function runDrain(projectId: string): Promise<void> {
    const queue = queueFor(projectId);
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
          await queue.write(projectId, next.content, { isKeepalive });
        } catch (error) {
          queue.isWriting = false;
          if (error instanceof EditorSaveConflictError) {
            // The project is immutable: nothing queued can ever land.
            queue.pending = null;
            queue.retryAttempt = 0;
            setStatus(queue, 'conflict');
            break;
          }
          if (error instanceof EditorSaveRejectedError) {
            logger.error('Editor project save was rejected', error);
            queue.retryAttempt = 0;
            setStatus(queue, 'failed');
            return;
          }
          logger.error('Failed to save the Editor project', error);
          setStatus(queue, 'failed');
          const delay = Math.min(
            retryBaseMs * 2 ** queue.retryAttempt,
            retryMaxMs,
          );
          queue.retryAttempt += 1;
          queue.retryTimer = setTimeout(() => {
            queue.retryTimer = null;
            void drain(projectId);
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
        clearUnsent(projectId);
      }
    } finally {
      queue.isDraining = false;
      queue.drainPromise = null;
    }
  }

  function drain(projectId: string): Promise<void> {
    const queue = queueFor(projectId);
    if (!queue.drainPromise) {
      queue.drainPromise = runDrain(projectId);
    }
    return queue.drainPromise;
  }

  return {
    enqueue(
      projectId,
      content,
      { isKeepalive = false, ownerId = null, write },
    ) {
      const queue = queueFor(projectId);
      const key = serializeEditorProjectContent(content);
      queue.write = write;

      if (!queue.isDraining && key === queue.acknowledgedKey) {
        // Back to what the server holds (an undo): nothing left to write.
        const hadWork = queue.pending !== null || queue.status === 'failed';
        queue.pending = null;
        clearRetry(queue);
        clearUnsent(projectId);
        if (hadWork) {
          setStatus(queue, 'saved');
        }
        return;
      }

      queue.pending = { content, key, ownerId };
      persistUnsent(projectId, queue);
      if (isKeepalive) {
        queue.isKeepaliveRequested = true;
      }
      // New content is worth trying now rather than after the backoff.
      clearRetry(queue);
      void drain(projectId);
    },

    discardUnsent(projectId) {
      clearUnsent(projectId);
    },

    getStatus(projectId) {
      return queueFor(projectId).status;
    },

    hasUnsavedEdits(projectId) {
      const queue = queues.get(projectId);
      return Boolean(queue && (queue.pending || queue.isWriting));
    },

    readUnsent(projectId, ownerId) {
      try {
        const raw = getStorage()?.getItem(storageKey(projectId));
        if (!raw) {
          return null;
        }
        const stored: unknown = JSON.parse(raw);
        if (
          !isRecord(stored) ||
          stored.ownerId !== ownerId ||
          !isProjectContent(stored.content) ||
          !Array.isArray(stored.baseKeys)
        ) {
          return null;
        }
        return {
          baseKeys: stored.baseKeys.filter(
            (key): key is string => typeof key === 'string',
          ),
          content: stored.content,
        };
      } catch {
        return null;
      }
    },

    setAcknowledged(projectId, content) {
      const queue = queueFor(projectId);
      queue.acknowledgedKey = serializeEditorProjectContent(content);
      queue.unacknowledgedSentKeys.clear();
    },

    async settle(projectId) {
      const queue = queueFor(projectId);
      clearRetry(queue);
      await drain(projectId);
      // A write that failed stops the drain; one more attempt answers whether
      // the edit can be saved now instead of after the backoff.
      while (queue.pending && queue.status !== 'failed' && !queue.isDraining) {
        await drain(projectId);
      }
      return queue.status;
    },

    subscribe(projectId, listener) {
      const queue = queueFor(projectId);
      queue.listeners.add(listener);
      return () => {
        queue.listeners.delete(listener);
      };
    },
  };
}

/** The app-wide outbox every Editor tab saves its projects through. */
export const editorSaveOutbox = createEditorSaveOutbox();
