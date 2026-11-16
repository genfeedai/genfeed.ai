import {
  readProviderFailure,
  readProviderRetryAfterMs,
} from '@api/services/integrations/publishers/publish-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';
import { isRecord } from '@genfeedai/utils/data/extract.util';

/**
 * Reddit answers a rejected `/api/submit` with HTTP 200 and a `json.errors`
 * list of `[CODE, message, field]` rows, so the HTTP status never shows the
 * refusal. Reddit's archived API wiki documents `RATELIMIT` ("you are doing
 * that too much") and `USER_REQUIRED` ("please login to do that"). The other
 * codes are not documented where this could be read, so any other row is read
 * as a refusal of this submission, which created no post.
 */
function readRedditSubmitErrorCode(data: unknown): string | undefined {
  const json = isRecord(data) && isRecord(data.json) ? data.json : undefined;
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  const first = errors.find((row): row is unknown[] => Array.isArray(row));
  return typeof first?.[0] === 'string' ? first[0] : undefined;
}

/** Throws the typed error when Reddit refused the submission in its body. */
export function throwIfRedditSubmitRejected(response: {
  data?: unknown;
  headers?: unknown;
}): void {
  const code = readRedditSubmitErrorCode(response.data);
  if (!code) return;

  const message = `Reddit rejected the post: ${code}`;
  if (code === 'RATELIMIT') {
    throw new PublishError(PublishErrorKind.RATE_LIMITED, message, {
      providerCode: code,
      retryAfterMs: readProviderRetryAfterMs(readProviderFailure({ response })),
    });
  }
  if (code === 'USER_REQUIRED') {
    throw new PublishError(PublishErrorKind.TOKEN_MUST_REFRESH, message, {
      providerCode: code,
    });
  }
  throw new PublishError(PublishErrorKind.CONTENT_REJECTED, message, {
    providerCode: code,
  });
}
