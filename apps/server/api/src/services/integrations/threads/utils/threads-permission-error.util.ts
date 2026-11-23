import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * True when Threads refused a call because the connected account never granted
 * the permission it needs (Graph error code 10, or the 200 range, or a 403).
 * An expired token (code 190) and rate limits are not permission errors, so a
 * transient failure never tells the user to reconnect.
 */
export function isThreadsPermissionError(error: unknown): boolean {
  if (!isRecord(error) || !isRecord(error.response)) {
    return false;
  }
  if (error.response.status === 403) {
    return true;
  }
  const { data } = error.response;
  const code = isRecord(data) && isRecord(data.error) ? data.error.code : null;
  return (
    typeof code === 'number' && (code === 10 || (code >= 200 && code < 300))
  );
}
