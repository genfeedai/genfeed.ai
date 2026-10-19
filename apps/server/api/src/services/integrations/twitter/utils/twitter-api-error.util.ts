import { isObjectLike } from '@genfeedai/utils/data/extract.util';

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (isObjectLike(error)) {
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }
    const data = isObjectLike(error.data) ? error.data : undefined;
    if (typeof data?.detail === 'string' && data.detail.trim().length > 0) {
      return data.detail;
    }
    if (typeof data?.title === 'string' && data.title.trim().length > 0) {
      return data.title;
    }
  }
  return String(error ?? 'Unknown error');
}

function readStatus(error: unknown): number | undefined {
  if (!isObjectLike(error)) {
    return undefined;
  }
  const data = isObjectLike(error.data) ? error.data : undefined;
  return (
    readFiniteNumber(error.status) ??
    readFiniteNumber(error.code) ??
    readFiniteNumber(data?.status)
  );
}

function readRateLimitResetIso(error: unknown): string | undefined {
  if (!isObjectLike(error)) {
    return undefined;
  }

  if (
    error.rateLimitReset instanceof Date &&
    !Number.isNaN(error.rateLimitReset.getTime())
  ) {
    return error.rateLimitReset.toISOString();
  }

  const headers = isObjectLike(error.headers) ? error.headers : undefined;
  const rateLimit = isObjectLike(error.rateLimit) ? error.rateLimit : undefined;
  const rawReset =
    rateLimit?.reset ?? headers?.['x-rate-limit-reset'] ?? error.rateLimitReset;
  const reset = readFiniteNumber(rawReset);
  if (reset === undefined) {
    return undefined;
  }

  const millis = reset < 1_000_000_000_000 ? reset * 1000 : reset;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export const X_TIER_LIMITATION_ERROR =
  'This X account cannot do that yet. Reconnect X with full access, or try again later.';
export const X_RATE_LIMIT_ERROR = 'X is busy. Wait a moment and try again.';
export const X_CREDENTIAL_ERROR =
  'X is not connected for this brand. Connect X and try again.';

function readAxiosStatus(error: unknown): number | undefined {
  if (!isObjectLike(error)) {
    return undefined;
  }
  const response = isObjectLike(error.response) ? error.response : undefined;
  return readFiniteNumber(response?.status);
}

function readOAuthErrorText(error: unknown): string {
  if (!isObjectLike(error)) {
    return '';
  }

  const response = isObjectLike(error.response) ? error.response : undefined;
  const responseData = isObjectLike(response?.data) ? response.data : undefined;
  const data = isObjectLike(error.data) ? error.data : undefined;
  return [
    responseData?.error,
    responseData?.error_description,
    data?.error,
    data?.error_description,
    error.error,
    error.error_description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
}

/** Expected callback failures caused by an expired, reused, or mismatched PKCE code. */
export function isTwitterOAuthCodeError(error: unknown): boolean {
  const oauthText = readOAuthErrorText(error);
  if (oauthText.includes('invalid_client')) {
    return false;
  }

  return (
    oauthText.includes('invalid_grant') ||
    oauthText.includes('authorization code') ||
    oauthText.includes('code verifier') ||
    oauthText.includes('code_verifier') ||
    oauthText.includes('expired code') ||
    oauthText.includes('already used')
  );
}

/**
 * True when X/Twitter rejected this deployment's own OAuth app credentials
 * (client id/secret or app type mismatch), rather than a caller-supplied
 * authorization code or token. This is a deployment configuration failure,
 * not a transient or per-user error.
 */
export function isTwitterClientAuthError(error: unknown): boolean {
  const status = readStatus(error) ?? readAxiosStatus(error);
  const oauthText = readOAuthErrorText(error);
  const message = readMessage(error).toLowerCase();

  const hasClientAuthText =
    oauthText.includes('invalid_client') ||
    oauthText.includes('unauthorized_client') ||
    message.includes('invalid_client') ||
    message.includes('unauthorized_client');

  return (status === 401 && hasClientAuthText) || hasClientAuthText;
}

/**
 * True when the OAuth2 token endpoint definitively rejected a refresh token
 * (`invalid_grant`, or a 400/401 response). Network failures, 5xx and rate
 * limits are transient and return false. `invalid_client` is this deployment's
 * own app configuration, not the user's grant, so it returns false too.
 */
export function isTwitterRefreshTokenRejectedError(error: unknown): boolean {
  if (isTwitterClientAuthError(error)) {
    return false;
  }

  const status = readStatus(error) ?? readAxiosStatus(error);
  return (
    status === 400 ||
    status === 401 ||
    readOAuthErrorText(error).includes('invalid_grant')
  );
}

export function isTwitterAuthorizationError(error: unknown): boolean {
  if (isTwitterScopeOrTierError(error) || isTwitterRateLimitError(error)) {
    return false;
  }

  const status = readStatus(error) ?? readAxiosStatus(error);
  const message = readMessage(error).toLowerCase();
  return (
    status === 401 ||
    message.includes('401') ||
    message.includes('unauthorized') ||
    message.includes('invalid token') ||
    message.includes('token expired') ||
    message.includes('could not authenticate')
  );
}

export function isTwitterScopeOrTierError(error: unknown): boolean {
  const status = readStatus(error) ?? readAxiosStatus(error);
  const message = readMessage(error).toLowerCase();
  const title = isObjectLike(error)
    ? String(
        (isObjectLike(error.response) && isObjectLike(error.response.data)
          ? error.response.data.title
          : undefined) ??
          (isObjectLike(error.data) ? error.data.title : undefined) ??
          '',
      ).toLowerCase()
    : '';

  return (
    status === 403 ||
    status === 453 ||
    message.includes('403') ||
    message.includes('453') ||
    message.includes('not authorized') ||
    message.includes('client-not-enrolled') ||
    message.includes('oauth1apppermissions') ||
    message.includes('access level') ||
    message.includes('elevated') ||
    message.includes('forbidden') ||
    title.includes('client-not-enrolled')
  );
}

export function isTwitterRateLimitError(error: unknown): boolean {
  const status = readStatus(error) ?? readAxiosStatus(error);
  const message = readMessage(error).toLowerCase();
  return (
    status === 429 ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    (isObjectLike(error) && isObjectLike(error.rateLimit))
  );
}

export function getTwitterRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  if (!isObjectLike(error)) {
    return fallbackMs;
  }

  const response = isObjectLike(error.response) ? error.response : undefined;
  const headers = isObjectLike(response?.headers)
    ? response.headers
    : isObjectLike(error.headers)
      ? error.headers
      : undefined;
  const retryAfter = readFiniteNumber(headers?.['retry-after']);
  if (retryAfter !== undefined && retryAfter >= 0) {
    return Math.min(retryAfter * 1_000, maximumMs);
  }

  const headerReset = readFiniteNumber(headers?.['x-rate-limit-reset']);
  if (headerReset !== undefined) {
    const millis =
      headerReset < 1_000_000_000_000 ? headerReset * 1000 : headerReset;
    const waitMs = millis - Date.now();
    if (Number.isFinite(waitMs) && waitMs > 0) {
      return Math.min(waitMs, maximumMs);
    }
  }

  const resetIso = readRateLimitResetIso(error);
  if (resetIso) {
    const waitMs = new Date(resetIso).getTime() - Date.now();
    if (Number.isFinite(waitMs) && waitMs > 0) {
      return Math.min(waitMs, maximumMs);
    }
  }

  return fallbackMs;
}

/**
 * Map X/Twitter API failures to distinct, actionable agent-facing classes.
 * Never collapse tier, rate-limit, or credential errors into an empty success.
 */
export function mapTwitterApiError(error: unknown): string {
  const message = readMessage(error);
  const lower = message.toLowerCase();
  const status = readStatus(error);

  const isTierLimitation =
    status === 403 ||
    status === 453 ||
    lower.includes('403') ||
    lower.includes('453') ||
    lower.includes('not authorized') ||
    lower.includes('client-not-enrolled') ||
    lower.includes('oauth1apppermissions') ||
    lower.includes('access level') ||
    lower.includes('elevated');

  if (isTierLimitation) {
    return X_TIER_LIMITATION_ERROR;
  }

  const isRateLimited =
    status === 429 ||
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    (isObjectLike(error) && isObjectLike(error.rateLimit));

  if (isRateLimited) {
    const resetAt = readRateLimitResetIso(error);
    return resetAt
      ? `X is busy. Try again after ${resetAt}.`
      : X_RATE_LIMIT_ERROR;
  }

  const isCredential =
    status === 401 ||
    lower.includes('credential') ||
    lower.includes('token') ||
    lower.includes('unauthorized') ||
    lower.includes('401');

  if (isCredential) {
    return X_CREDENTIAL_ERROR;
  }

  return message;
}

function readProviderDetail(error: unknown): string | undefined {
  if (!isObjectLike(error)) {
    return undefined;
  }
  const data = isObjectLike(error.data) ? error.data : undefined;
  if (!data) {
    return undefined;
  }
  const detail =
    typeof data.detail === 'string' ? data.detail.trim() : undefined;
  const title = typeof data.title === 'string' ? data.title.trim() : undefined;
  return detail || title || undefined;
}

export const X_CREDITS_DEPLETED_CODE = 'x_credits_depleted';
export const X_CREDITS_DEPLETED_ERROR =
  'X API credits depleted. Add credits to the X developer account, then retry.';

/** X answers 402 (title CreditsDepleted) when the API account is out of credits. */
export function isTwitterCreditsDepletedError(error: unknown): boolean {
  if (!isObjectLike(error)) {
    return false;
  }
  const data = isObjectLike(error.data) ? error.data : undefined;
  const title = typeof data?.title === 'string' ? data.title : '';
  const type = typeof data?.type === 'string' ? data.type : '';
  return (
    readStatus(error) === 402 || /credits?-?depleted/i.test(`${title} ${type}`)
  );
}

/**
 * The reason X gave for rejecting a publish. twitter-api-v2 only appends X's
 * explanation to the error message when the body has an `errors` array, so a
 * duplicate-content 403, a 402 CreditsDepleted or an expired-token 401 reaches
 * the post as a bare "Request failed with code 403". The text X sent in
 * `data.detail` / `data.title` is added back so the owner can act on it, and
 * an out-of-credits account is named as such.
 */
export function describeTwitterPublishError(error: unknown): string {
  const message = readMessage(error);
  const detail = readProviderDetail(error);
  const described =
    !detail || message.includes(detail) ? message : `${message} - ${detail}`;
  return isTwitterCreditsDepletedError(error)
    ? `${X_CREDITS_DEPLETED_ERROR} (${described})`
    : described;
}
