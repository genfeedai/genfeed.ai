import { isRecord } from '@genfeedai/utils/data/extract.util';

/** The Graph API error body of a failed Threads call, when it has one. */
function readGraphError(error: unknown): Record<string, unknown> | null {
  if (!isRecord(error) || !isRecord(error.response)) return null;
  const { data } = error.response;
  return isRecord(data) && isRecord(data.error) ? data.error : null;
}

function readStatus(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const response = isRecord(error.response) ? error.response : null;
  const status = response?.status ?? error.status ?? error.statusCode;
  return typeof status === 'number' ? status : null;
}

/**
 * True when Threads definitively rejected the token being refreshed: an
 * invalid or expired token (Graph API error code 190) or a 401. Network
 * failures, 5xx and rate limits (Graph codes 4, 17, 32 and 613 also arrive as
 * OAuthException) return false, so a transient failure never disconnects a
 * healthy channel.
 */
export function isThreadsRefreshRejectedError(error: unknown): boolean {
  if (readStatus(error) === 401) return true;
  return readGraphError(error)?.code === 190;
}
