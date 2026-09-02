import type { AxiosError } from 'axios';

interface ApifyApiError {
  message?: string;
  type?: string;
}

interface ApifyErrorPayload {
  error?: ApifyApiError;
}

/**
 * Apify error types that mean the whole account is blocked until the owner
 * raises the limit or the billing period rolls over — not a per-actor or
 * per-request failure.
 */
const ACCOUNT_LIMIT_ERROR_TYPES = new Set([
  'monthly-usage-hard-limit-exceeded',
  'usage-limit-exceeded',
]);

/**
 * `platform-feature-disabled` is Apify's generic account-level refusal, so it
 * only counts as a usage limit when the message says so.
 */
const ACCOUNT_LIMIT_MESSAGE_PATTERN =
  /(monthly|usage)[^.]*\b(hard\s+)?limit\s+exceeded/i;

const AUTHORIZATION_ERROR_TYPES = new Set([
  'token-not-provided',
  'user-or-token-not-found',
]);

function getApifyErrorBody(error: unknown): ApifyApiError | undefined {
  const axiosError = error as AxiosError<ApifyErrorPayload> | null | undefined;
  const apiError = axiosError?.response?.data?.error;

  return typeof apiError === 'object' && apiError !== null
    ? apiError
    : undefined;
}

export function getApifyErrorStatus(error: unknown): number | undefined {
  const axiosError = error as AxiosError<ApifyErrorPayload> | null | undefined;
  const status = axiosError?.response?.status;

  return typeof status === 'number' && Number.isFinite(status)
    ? status
    : undefined;
}

export function getApifyErrorType(error: unknown): string | undefined {
  const type = getApifyErrorBody(error)?.type;

  return typeof type === 'string' && type.length > 0 ? type : undefined;
}

export function getApifyErrorMessage(error: unknown): string | undefined {
  const message = getApifyErrorBody(error)?.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }

  return undefined;
}

/**
 * True when Apify refused the call because the account exhausted its plan
 * usage. Every subsequent call fails the same way until the owner acts, so
 * callers must stop retrying rather than hammer the API.
 */
export function isApifyAccountLimitError(error: unknown): boolean {
  if (getApifyErrorStatus(error) !== 403) {
    return false;
  }

  const type = getApifyErrorType(error);
  if (type && ACCOUNT_LIMIT_ERROR_TYPES.has(type)) {
    return true;
  }

  const message = getApifyErrorMessage(error);

  return Boolean(message && ACCOUNT_LIMIT_MESSAGE_PATTERN.test(message));
}

/**
 * True when the token itself is missing, unknown, or rejected — a credential
 * problem rather than a usage problem.
 */
export function isApifyAuthorizationError(error: unknown): boolean {
  if (isApifyAccountLimitError(error)) {
    return false;
  }

  if (getApifyErrorStatus(error) === 401) {
    return true;
  }

  const type = getApifyErrorType(error);

  return Boolean(type && AUTHORIZATION_ERROR_TYPES.has(type));
}

/**
 * Compact one-line summary for logs, so an Apify failure is readable without
 * dumping an axios stack trace on every occurrence.
 */
export function describeApifyError(error: unknown): string {
  const status = getApifyErrorStatus(error);
  const type = getApifyErrorType(error);
  const message = getApifyErrorMessage(error);

  const prefix = [status, type].filter(Boolean).join(' ');
  if (!prefix) {
    return message ?? 'Unknown Apify error';
  }

  return message ? `${prefix}: ${message}` : prefix;
}
