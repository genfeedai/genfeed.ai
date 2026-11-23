import type { VideoCompletionEvent } from '@api/services/video-completion/video-completion.service';
import { Status } from '@genfeedai/contracts';

export function isVideoCompletionEvent(
  data: unknown,
): data is VideoCompletionEvent {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const candidate = data as Record<string, unknown>;
  return (
    typeof candidate.ingredientId === 'string' &&
    candidate.ingredientId.length > 0 &&
    typeof candidate.organizationId === 'string' &&
    candidate.organizationId.length > 0 &&
    (candidate.status === Status.COMPLETED ||
      candidate.status === Status.FAILED) &&
    typeof candidate.timestamp === 'string' &&
    candidate.timestamp.length > 0
  );
}
