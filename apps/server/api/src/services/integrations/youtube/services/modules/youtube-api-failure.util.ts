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
