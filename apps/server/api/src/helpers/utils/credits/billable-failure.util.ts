/**
 * A failed request whose provider cost is already known and must be charged,
 * not released. The credits interceptor settles the finalized charge for these
 * instead of releasing the reservation.
 */
export function isBillableFailure(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'isBillableFailure' in error &&
    error.isBillableFailure === true
  );
}
