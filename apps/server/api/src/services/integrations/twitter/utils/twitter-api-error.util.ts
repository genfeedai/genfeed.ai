function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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
  if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }
    const data = isRecord(error.data) ? error.data : undefined;
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
  if (!isRecord(error)) {
    return undefined;
  }
  const data = isRecord(error.data) ? error.data : undefined;
  return (
    readFiniteNumber(error.status) ??
    readFiniteNumber(error.code) ??
    readFiniteNumber(data?.status)
  );
}

function readRateLimitResetIso(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  if (
    error.rateLimitReset instanceof Date &&
    !Number.isNaN(error.rateLimitReset.getTime())
  ) {
    return error.rateLimitReset.toISOString();
  }

  const headers = isRecord(error.headers) ? error.headers : undefined;
  const rateLimit = isRecord(error.rateLimit) ? error.rateLimit : undefined;
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
    (isRecord(error) && isRecord(error.rateLimit));

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
