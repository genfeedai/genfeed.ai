import {
  type ProviderErrorMapper,
  toPublishErrorOrUnknown,
} from '@api/services/integrations/publishers/publish-error.util';
import { PublishErrorKind } from '@genfeedai/contracts';
import type { PublishError } from '@genfeedai/contracts/interfaces';

export interface ArticlePublishErrorOptions {
  /**
   * Whether a 401 can be fixed by refreshing the access token. API-key
   * providers and non-expiring tokens cannot, so a 401 there means the owner
   * must reconnect.
   */
  isTokenRefreshable?: boolean;
}

/**
 * 402 and 423 mean the account is frozen or locked, and 404 that the site,
 * publication or user the credential points at is gone. As with 403, the owner
 * has to fix the account.
 */
const ACCOUNT_STATUSES: ReadonlySet<number> = new Set([402, 404, 423]);

function mapArticleFailure(
  options: ArticlePublishErrorOptions,
): ProviderErrorMapper {
  return ({ httpStatus }) => {
    if (httpStatus === 401) {
      return {
        kind: options.isTokenRefreshable
          ? PublishErrorKind.TOKEN_MUST_REFRESH
          : PublishErrorKind.CHANNEL_DISCONNECTED,
      };
    }
    return httpStatus !== undefined && ACCOUNT_STATUSES.has(httpStatus)
      ? { kind: PublishErrorKind.CHANNEL_DISCONNECTED }
      : null;
  };
}

/**
 * The typed failure for a request that failed while creating an article, post
 * or product. The shared classifier reads the HTTP status and the network
 * code; this only says what the blog and store providers mean by 401, 402, 404
 * and 423.
 */
export function toArticlePublishError(
  error: unknown,
  options: ArticlePublishErrorOptions = {},
): PublishError {
  return toPublishErrorOrUnknown(error, mapArticleFailure(options));
}
