export type YoutubeApiErrorShape = {
  code?: unknown;
  errors?: Array<{ reason?: unknown }>;
  message?: unknown;
  response?: {
    data?: { error?: { errors?: Array<{ reason?: unknown }> } | string };
    status?: unknown;
  };
  status?: unknown;
};

export function readYoutubeFailureReasons(
  failure: YoutubeApiErrorShape,
): unknown[] {
  const nested = failure.response?.data?.error;
  return [
    ...(failure.errors ?? []),
    ...(typeof nested === 'object' ? (nested.errors ?? []) : []),
  ].map((entry) => entry.reason);
}

export function readYoutubeFailureStatus(
  failure: YoutubeApiErrorShape,
): number {
  return Number(failure.response?.status ?? failure.status ?? 0);
}

/**
 * The video was deleted or made private on YouTube. There is nothing left to
 * read, so callers treat it as a skipped video and not as a sync failure.
 */
export function isYoutubeVideoMissingError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const failure = error as YoutubeApiErrorShape;
  return (
    readYoutubeFailureStatus(failure) === 404 ||
    readYoutubeFailureReasons(failure).includes('videoNotFound')
  );
}

/**
 * The owner switched comments off for this video (HTTP 403, reason
 * `commentsDisabled`). Nothing can be read until they switch them back on, so
 * the hourly inbox sweep skips the video instead of reporting a fault each hour.
 */
export function isYoutubeCommentsDisabledError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const failure = error as YoutubeApiErrorShape;
  return (
    readYoutubeFailureReasons(failure).includes('commentsDisabled') ||
    (readYoutubeFailureStatus(failure) === 403 &&
      typeof failure.message === 'string' &&
      failure.message.includes('has disabled comments'))
  );
}

const QUOTA_FAILURE_REASONS: ReadonlySet<unknown> = new Set([
  'dailyLimitExceeded',
  'quotaExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
]);

/**
 * YouTube refused the read with HTTP 403 for a reason other than quota: the
 * key or channel has no access to this video, or the API is not enabled for
 * it. The caller names the access problem to the person; retrying the same
 * read changes nothing, and it is not a fault in our own service.
 */
export function isYoutubePermissionDeniedError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const failure = error as YoutubeApiErrorShape;
  return (
    readYoutubeFailureStatus(failure) === 403 &&
    !readYoutubeFailureReasons(failure).some((reason) =>
      QUOTA_FAILURE_REASONS.has(reason),
    ) &&
    !isYoutubeCommentsDisabledError(error)
  );
}
