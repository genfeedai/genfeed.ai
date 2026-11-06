import { WebhookUrlUnresolvableException } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import { ApiKeyConnectErrorCode } from '@genfeedai/contracts';
import { isAxiosError } from '@genfeedai/utils/error/json-api-status.util';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

/**
 * English detail for API clients. The web form shows its own translated
 * message keyed on the code, so these never reach a user through the app.
 */
const API_KEY_CONNECT_ERROR_DETAILS: Record<ApiKeyConnectErrorCode, string> = {
  [ApiKeyConnectErrorCode.API_NOT_FOUND]:
    'The site answered, but not with the expected API. Check the site URL.',
  [ApiKeyConnectErrorCode.HTTPS_REQUIRED]:
    'Use the https:// address of the site. Keys are never sent over http.',
  [ApiKeyConnectErrorCode.INVALID_KEY_FORMAT]:
    'The key is not in the format the provider issues.',
  [ApiKeyConnectErrorCode.INVALID_URL]:
    'The site URL is not a valid public web address.',
  [ApiKeyConnectErrorCode.KEY_REJECTED]: 'The provider rejected the key.',
  [ApiKeyConnectErrorCode.PUBLICATION_NOT_FOUND]:
    'The key sees no matching publication.',
  [ApiKeyConnectErrorCode.SITE_REDIRECTED]:
    'The site URL redirects to another address. Use the final address.',
  [ApiKeyConnectErrorCode.SITE_UNREACHABLE]:
    'The site could not be reached. Check the address and that the site is online.',
  [ApiKeyConnectErrorCode.UNKNOWN]: 'The account could not be connected.',
};

/**
 * The exception a key-based connect route throws. Every known reason is a
 * 400 (the user can fix it in the form); only an unclassified failure is a
 * 500. Never 401: the web client treats 401 as an expired Genfeed session.
 */
export function createApiKeyConnectException(
  code: ApiKeyConnectErrorCode,
): HttpException {
  return new HttpException(
    {
      code,
      detail: API_KEY_CONNECT_ERROR_DETAILS[code],
      title: 'Connect failed',
    },
    code === ApiKeyConnectErrorCode.UNKNOWN
      ? HttpStatus.INTERNAL_SERVER_ERROR
      : HttpStatus.BAD_REQUEST,
  );
}

/**
 * Classify a failure from verifying a key against the provider.
 *
 * - The SSRF-safe agent refuses an unresolvable host (typo) or a private
 *   address before any request is sent.
 * - Requests run with `maxRedirects: 0`, so a redirect surfaces as a 3xx.
 * - No response at all is DNS, connection, TLS or timeout trouble.
 */
export function classifyApiKeyConnectError(
  error: unknown,
): ApiKeyConnectErrorCode {
  if (error instanceof WebhookUrlUnresolvableException) {
    return ApiKeyConnectErrorCode.SITE_UNREACHABLE;
  }
  if (error instanceof BadRequestException) {
    return ApiKeyConnectErrorCode.INVALID_URL;
  }
  if (!isAxiosError(error)) {
    return ApiKeyConnectErrorCode.UNKNOWN;
  }

  const status = error.response?.status;
  if (status === undefined) {
    return ApiKeyConnectErrorCode.SITE_UNREACHABLE;
  }
  if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
    return ApiKeyConnectErrorCode.KEY_REJECTED;
  }
  if (status >= 300 && status < 400) {
    return ApiKeyConnectErrorCode.SITE_REDIRECTED;
  }
  if (status === HttpStatus.NOT_FOUND) {
    return ApiKeyConnectErrorCode.API_NOT_FOUND;
  }
  return ApiKeyConnectErrorCode.UNKNOWN;
}
