const MIN_SWEEP_EXPIRY_MS = 10 * 60 * 1000;

/**
 * How long a slot-keyed sweep run may wait in the queue: one cycle of its
 * schedule, floored so a one-minute cadence tolerates a normal backlog. A run
 * older than that is superseded by the next tick (#5634).
 */
export function sweepExpiryMs(intervalMs: number): number {
  return Math.max(intervalMs, MIN_SWEEP_EXPIRY_MS);
}
