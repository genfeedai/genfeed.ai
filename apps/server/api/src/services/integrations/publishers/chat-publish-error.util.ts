import { PublishErrorKind } from '@genfeedai/contracts';
import { PublishError } from '@genfeedai/contracts/interfaces';

/**
 * The failure Discord, Slack and Telegram services throw. Each reads the HTTP
 * status (and Slack's documented error names) into one of five kinds, so this
 * only says what a kind means to the pipeline.
 */
interface ChatApiFailure extends Error {
  kind:
    | 'bot_removed'
    | 'channel_unavailable'
    | 'rate_limited'
    | 'rejected'
    | 'token_invalid'
    | 'token_revoked'
    | 'unavailable'
    | 'webhook_gone';
  statusCode?: number;
  retryAfterMs?: number;
}

const PUBLISH_ERROR_KIND_BY_FAILURE: Record<
  ChatApiFailure['kind'],
  PublishErrorKind
> = {
  bot_removed: PublishErrorKind.CHANNEL_DISCONNECTED,
  channel_unavailable: PublishErrorKind.CHANNEL_DISCONNECTED,
  rate_limited: PublishErrorKind.RATE_LIMITED,
  rejected: PublishErrorKind.CONTENT_REJECTED,
  token_invalid: PublishErrorKind.CHANNEL_DISCONNECTED,
  token_revoked: PublishErrorKind.CHANNEL_DISCONNECTED,
  // A 5xx or no answer: the message may have been posted.
  unavailable: PublishErrorKind.OUTCOME_UNKNOWN,
  webhook_gone: PublishErrorKind.CHANNEL_DISCONNECTED,
};

export function toChatPublishError(error: ChatApiFailure): PublishError {
  return new PublishError(
    PUBLISH_ERROR_KIND_BY_FAILURE[error.kind],
    error.message,
    {
      cause: error,
      httpStatus: error.statusCode,
      retryAfterMs: error.retryAfterMs,
    },
  );
}
