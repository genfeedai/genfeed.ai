/**
 * When the oldest question a thread is waiting on was asked, or null when none
 * is pending. A request without a readable time counts as asked now, so it
 * still marks the thread as waiting. The thread engine stores this beside the
 * pending list (`AgentThreadSnapshot.pendingInputAt`) so the review inbox finds
 * waiting threads from an index instead of reading snapshot JSON.
 */
export function oldestPendingInputAt(pending: unknown): Date | null {
  if (!Array.isArray(pending) || pending.length === 0) return null;
  const times = pending.flatMap((request) => {
    const createdAt =
      typeof request === 'object' && request !== null
        ? (request as { createdAt?: unknown }).createdAt
        : undefined;
    const time = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
    return Number.isFinite(time) ? [time] : [];
  });
  return new Date(times.length > 0 ? Math.min(...times) : Date.now());
}

/**
 * The pending requests that can still be answered. A newer question marks the
 * older pending one `superseded` in `inputRequests`, and the thread's answer
 * route refuses it, so it must not stay in `pendingInputRequests`.
 */
export function dropSuperseded(
  snapshotData: Record<string, unknown>,
  inputRequests: ReadonlyArray<Record<string, unknown>>,
): unknown[] {
  const pending = snapshotData.pendingInputRequests;
  const superseded = new Set(
    inputRequests
      .filter((request) => request.status === 'superseded')
      .map((request) => request.requestId),
  );
  return (Array.isArray(pending) ? pending : []).filter(
    (request) =>
      !superseded.has((request as { requestId?: unknown } | null)?.requestId),
  );
}
