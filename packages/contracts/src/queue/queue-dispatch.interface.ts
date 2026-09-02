/**
 * Typed outcome of enqueueing background work (#2382).
 *
 * `QueueService.add()` returns a BullMQ `Job` and rejects when the broker is
 * unreachable, which reaches an HTTP caller as an opaque 500 — indistinguishable
 * from a real server fault. A deployment that legitimately has no broker (the
 * offline desktop app, epic #2378) needs the *absence of a worker* to be a
 * first-class, inspectable result instead: the caller can then persist the
 * request, tell the user the work is deferred, or run it inline.
 *
 * This is a discriminated union rather than a nullable job so that every call
 * site is forced by the compiler to handle the degraded branch.
 */
export enum QueueDispatchStatus {
  /**
   * No broker is reachable and none is expected — the job was not enqueued and
   * will not run. Callers must decide what to do instead; nothing is retried.
   */
  DEGRADED = 'degraded',
  /** The job was accepted by the broker and has an id. */
  ENQUEUED = 'enqueued',
}

/** Why a dispatch degraded, for logging and for the caller's fallback choice. */
export enum QueueDegradationReason {
  /** The configured driver has no broker at all (single-process deployment). */
  NO_BROKER_CONFIGURED = 'no-broker-configured',
  /** A broker is configured but could not be reached for this dispatch. */
  BROKER_UNREACHABLE = 'broker-unreachable',
}

export interface QueueDispatchEnqueued {
  jobId: string;
  queueName: string;
  status: QueueDispatchStatus.ENQUEUED;
}

export interface QueueDispatchDegraded {
  /** Human-readable detail; safe to log, not intended for end users. */
  detail: string;
  queueName: string;
  reason: QueueDegradationReason;
  status: QueueDispatchStatus.DEGRADED;
}

export type QueueDispatchResult = QueueDispatchEnqueued | QueueDispatchDegraded;

/** Narrowing helper so callers read as intent rather than as enum plumbing. */
export function isQueueDispatchEnqueued(
  result: QueueDispatchResult,
): result is QueueDispatchEnqueued {
  return result.status === QueueDispatchStatus.ENQUEUED;
}
