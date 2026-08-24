export const VIDEO_PILOT_PAID_RETRY_CEILING = 3;

/**
 * Studio/user-review fallback for the workflow video pilot-run gate.
 * Returns the provider-minimum duration when a full-length run should be
 * previewed first, or null when the requested duration is already minimal.
 */
export function resolveVideoPilotDuration(
  requestedDuration: number,
  durationOptions: number[],
): number | null {
  if (
    !Number.isFinite(requestedDuration) ||
    requestedDuration <= 0 ||
    durationOptions.length === 0
  ) {
    return null;
  }

  const minDuration = Math.min(
    ...durationOptions.filter(
      (option) => Number.isFinite(option) && option > 0,
    ),
  );

  if (!Number.isFinite(minDuration) || requestedDuration <= minDuration) {
    return null;
  }

  return minDuration;
}

export function hasReachedVideoPilotRetryCeiling(
  rejectedPaidCandidates: number,
  ceiling: number = VIDEO_PILOT_PAID_RETRY_CEILING,
): boolean {
  return rejectedPaidCandidates >= ceiling;
}
