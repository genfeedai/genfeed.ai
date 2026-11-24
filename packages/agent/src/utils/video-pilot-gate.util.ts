export const VIDEO_PILOT_PAID_RETRY_CEILING = 3;

export function hasReachedVideoPilotRetryCeiling(
  rejectedPaidCandidates: number,
  ceiling: number = VIDEO_PILOT_PAID_RETRY_CEILING,
): boolean {
  return rejectedPaidCandidates >= ceiling;
}
