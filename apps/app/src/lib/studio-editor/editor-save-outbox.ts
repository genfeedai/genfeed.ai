import { isRecord } from '@genfeedai/utils/data/extract.util';
import { createScopedOutbox } from '@genfeedai/utils/outbox/scoped-outbox.util';
import type {
  EditorProjectContent,
  EditorSaveOutbox,
  EditorSaveOutboxOptions,
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

export const EDITOR_SAVE_OUTBOX_STORAGE_PREFIX =
  'genfeed.studio.editor.save-outbox.v1';

function isProjectContent(value: unknown): value is EditorProjectContent {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isRecord(value.settings) &&
    typeof value.totalDurationFrames === 'number' &&
    Array.isArray(value.tracks)
  );
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
export function createEditorSaveOutbox(
  options: EditorSaveOutboxOptions = {},
): EditorSaveOutbox {
  const outbox = createScopedOutbox<
    EditorProjectContent,
    EditorUnsentEdit,
    'failed' | 'conflict'
  >(
    {
      classifyFailure: (error) => {
        if (error instanceof EditorSaveConflictError) {
          // The project is immutable: nothing queued can ever land.
          return { action: 'drop-all', logMessage: null, status: 'conflict' };
        }
        if (error instanceof EditorSaveRejectedError) {
          return {
            action: 'hold',
            logMessage: 'Editor project save was rejected',
            status: 'failed',
          };
        }
        return null;
      },
      fromStored: (stored) => {
        if (
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
      },
      logError: (message, error) => logger.error(message, error),
      markSavedOnRevert: true,
      retryLogMessage: 'Failed to save the Editor project',
      retryStatus: 'failed',
      serialize: serializeEditorProjectContent,
      storageKeyPrefix: EDITOR_SAVE_OUTBOX_STORAGE_PREFIX,
      toStored: ({ ownerId, payload }, { baseKeys }) => ({
        baseKeys,
        content: payload,
        ownerId,
      }),
    },
    options,
  );

  return {
    discardUnsent: outbox.discardUnsent,
    enqueue(projectId, content, { isKeepalive, ownerId, write }) {
      outbox.enqueue(projectId, content, {
        isKeepalive,
        ownerId,
        write: (id, payload, { isKeepalive: isKeepaliveWrite }) =>
          write(id, payload, { isKeepalive: isKeepaliveWrite }),
      });
    },
    getStatus: outbox.getStatus,
    hasUnsavedEdits: outbox.hasUnsavedWrites,
    readUnsent: outbox.readUnsent,
    setAcknowledged: outbox.setAcknowledged,
    settle: outbox.settle,
    subscribe: outbox.subscribe,
  };
}

/** The app-wide outbox every Editor tab saves its projects through. */
export const editorSaveOutbox = createEditorSaveOutbox();
