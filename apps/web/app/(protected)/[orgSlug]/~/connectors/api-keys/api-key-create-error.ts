import { isServiceOperationError } from '@services/core/operation-error';

const API_KEY_LIMIT_TITLE = 'API Key Limit Reached';
const API_KEY_LIMIT_DETAIL = 'maximum number of API keys';

/**
 * The 10-key cap is a product limit, returned as HTTP 400. It is not an
 * application failure, so the settings page shows the server detail and
 * does not report it.
 */
export function isApiKeyLimitReached(error: unknown): error is Error {
  if (!isServiceOperationError(error) || error.status !== 400) {
    return false;
  }

  return (
    error.category === API_KEY_LIMIT_TITLE ||
    error.message.includes(API_KEY_LIMIT_DETAIL)
  );
}
