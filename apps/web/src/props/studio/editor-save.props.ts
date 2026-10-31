import type { IEditorProject } from '@genfeedai/contracts/interfaces';

/** The slice of a project the Editor autosaves and undo/redo tracks. */
export type EditorProjectContent = Pick<
  IEditorProject,
  'name' | 'settings' | 'totalDurationFrames' | 'tracks'
>;

/**
 * `conflict` means the server refuses every update (a locked composition
 * project); the Editor switches to read-only instead of retrying.
 */
export type EditorSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'failed'
  | 'conflict';

export type EditorSaveWrite = (
  projectId: string,
  content: EditorProjectContent,
  options: { isKeepalive: boolean },
) => Promise<unknown>;

export type EditorSaveStatusListener = (status: EditorSaveStatus) => void;

/** The slice of `Storage` the outbox keeps unsent edits in. */
export type EditorSaveStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'setItem'
>;

export interface EditorSaveOutboxOptions {
  /** Resolved on every use, so server rendering never touches `window`. */
  getStorage?: () => EditorSaveStorage | null;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

/** An edit a previous page queued but never saw the server acknowledge. */
export interface EditorUnsentEdit {
  content: EditorProjectContent;
  /**
   * Content keys the edit was made on top of: what the server last
   * acknowledged plus anything sent without an answer. A server version
   * outside this set was written elsewhere, so the local edit is stale.
   */
  baseKeys: string[];
}

export interface EditorSaveOutbox {
  /**
   * Queues the project's latest content. Only the newest content is kept;
   * writes are serialized, retried with backoff and mirrored to storage until
   * acknowledged, so a page teardown mid-queue cannot lose them.
   */
  enqueue: (
    projectId: string,
    content: EditorProjectContent,
    options: {
      isKeepalive?: boolean;
      ownerId?: string | null;
      write: EditorSaveWrite;
    },
  ) => void;
  getStatus: (projectId: string) => EditorSaveStatus;
  /** Something is queued, in flight or waiting on a retry. */
  hasUnsavedEdits: (projectId: string) => boolean;
  /** Drops the stored copy of an edit that will not be replayed. */
  discardUnsent: (projectId: string) => void;
  readUnsent: (projectId: string, ownerId: string) => EditorUnsentEdit | null;
  /** What the server holds, e.g. the project a load returned. */
  setAcknowledged: (projectId: string, content: EditorProjectContent) => void;
  /**
   * Writes anything queued now (skipping a pending retry delay) and resolves
   * with the status once the queue has nothing left to try.
   */
  settle: (projectId: string) => Promise<EditorSaveStatus>;
  subscribe: (
    projectId: string,
    listener: EditorSaveStatusListener,
  ) => () => void;
}

/** Session-only undo/redo stacks; each entry is a whole-content snapshot. */
export interface EditorHistory {
  past: EditorProjectContent[];
  future: EditorProjectContent[];
  /**
   * The gesture the newest entry belongs to (a slider drag, a clip drag), so
   * its continuous updates collapse into one undo step.
   */
  lastGestureKey: string | null;
  lastEditAt: number;
}
