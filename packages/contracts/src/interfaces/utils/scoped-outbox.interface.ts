/** Statuses every outbox moves through; callers add their own failure states. */
export type ScopedOutboxStatus<TFailure extends string> =
  | 'idle'
  | 'saving'
  | 'saved'
  | TFailure;

export type ScopedOutboxStatusListener<TFailure extends string> = (
  status: ScopedOutboxStatus<TFailure>,
) => void;

/** The slice of `Storage` the outbox persists unsent writes through. */
export type ScopedOutboxStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'setItem'
>;

export type ScopedOutboxWrite<TPayload> = (
  scopeId: string,
  payload: TPayload,
  options: { isKeepalive: boolean; ownerId: string | null },
) => Promise<unknown>;

/**
 * What the outbox does with a write that threw:
 * - `drop-write`: forget that write; anything newer queued meanwhile is tried.
 * - `drop-all`: forget everything queued; nothing can land any more.
 * - `hold`: keep the queued write, but stop until a new write or settle.
 * `null` from `classifyFailure` means a transient failure: retry with backoff.
 */
export interface ScopedOutboxFailureResolution<TFailure extends string> {
  action: 'drop-all' | 'drop-write' | 'hold';
  logMessage: string | null;
  status: TFailure;
}

/** What is persisted next to an unsent payload so a later page can judge it. */
export interface ScopedOutboxStoredContext {
  /** What the server last acknowledged plus anything sent without an answer. */
  baseKeys: string[];
}

export interface ScopedOutboxConfig<
  TPayload,
  TUnsent,
  TFailure extends string,
> {
  /** Maps a thrown write error to a policy; `null` means retry with backoff. */
  classifyFailure: (
    error: unknown,
  ) => ScopedOutboxFailureResolution<TFailure> | null;
  /** Rebuilds what `readUnsent` returns from a stored record of this owner. */
  fromStored: (stored: Record<string, unknown>) => TUnsent | null;
  /** The error `whenIdle` rejects with when its deadline passes. */
  idleTimeoutMessage?: string;
  logError: (message: string, error: unknown) => void;
  /** Status set while a write fails transiently and is waiting on a retry. */
  retryStatus: TFailure;
  retryLogMessage: string;
  serialize: (payload: TPayload) => string;
  /** The record persisted for an unsent payload owned by `ownerId`. */
  toStored: (
    entry: { ownerId: string; payload: TPayload },
    context: ScopedOutboxStoredContext,
  ) => Record<string, unknown>;
  storageKeyPrefix: string;
  /** Returning to acknowledged content flips a finished failure to `saved`. */
  markSavedOnRevert?: boolean;
}

export interface ScopedOutboxOptions {
  /** Resolved on every use, so server rendering never touches `window`. */
  getStorage?: () => ScopedOutboxStorage | null;
  /** Maximum wait for `whenIdle`; timing out keeps the queue recoverable. */
  idleTimeoutMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
}

export interface ScopedOutbox<TPayload, TUnsent, TFailure extends string> {
  /**
   * Queues the scope's latest payload. Only the newest is kept; writes are
   * serialized, retried with backoff and, with an `ownerId`, mirrored to
   * storage until acknowledged so a page teardown cannot lose them.
   */
  enqueue: (
    scopeId: string,
    payload: TPayload,
    options: {
      isKeepalive?: boolean;
      ownerId?: string | null;
      write: ScopedOutboxWrite<TPayload>;
    },
  ) => void;
  /** Drops every queued write another user left behind in this tab. */
  discardForeign: (ownerId: string) => void;
  /** Drops the stored copy of a write that will not be replayed. */
  discardUnsent: (scopeId: string) => void;
  getStatus: (scopeId: string) => ScopedOutboxStatus<TFailure>;
  /** Something is queued, in flight or waiting on a retry. */
  hasUnsavedWrites: (scopeId: string) => boolean;
  readUnsent: (scopeId: string, ownerId: string) => TUnsent | null;
  /** What the server holds for the scope, e.g. what a load returned. */
  setAcknowledged: (scopeId: string, payload: TPayload) => void;
  /**
   * Writes anything queued now (skipping a pending retry delay) and resolves
   * with the status once the queue has nothing left to try.
   */
  settle: (scopeId: string) => Promise<ScopedOutboxStatus<TFailure>>;
  subscribe: (
    scopeId: string,
    listener: ScopedOutboxStatusListener<TFailure>,
  ) => () => void;
  /**
   * Resolves once the scope has nothing in flight, queued, or waiting on a
   * retry. Rejects after the idle deadline; the write/retry queue is kept.
   */
  whenIdle: (scopeId: string) => Promise<void>;
}

export interface ScopedOutboxPendingWrite<TPayload> {
  key: string;
  ownerId: string | null;
  payload: TPayload;
}

export interface ScopedOutboxQueue<TPayload, TFailure extends string> {
  acknowledgedKey: string | null;
  drainPromise: Promise<void> | null;
  idleWaiters: Array<() => void>;
  isDraining: boolean;
  isKeepaliveRequested: boolean;
  isWriting: boolean;
  listeners: Set<ScopedOutboxStatusListener<TFailure>>;
  pending: ScopedOutboxPendingWrite<TPayload> | null;
  retryAttempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  status: ScopedOutboxStatus<TFailure>;
  /** Sent since the last acknowledgement; the server may hold any of them. */
  unacknowledgedSentKeys: Set<string>;
  write: ScopedOutboxWrite<TPayload> | null;
}
