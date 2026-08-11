import type { AxiosError } from 'axios';

interface TikTokErrorPayload {
  data?: { error?: { code?: string } };
  error?: { code?: string } | string;
  error_description?: string;
}

export function parseTikTokGrantedScopes(value: unknown): string[] {
  const scopes = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return [
    ...new Set(
      scopes
        .filter((scope): scope is string => typeof scope === 'string')
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ].sort();
}

export function getTikTokErrorCode(error: unknown): string | undefined {
  const axiosError = error as AxiosError<TikTokErrorPayload>;
  const data = axiosError.response?.data;
  const errorCode =
    (typeof data?.error === 'object' ? data.error.code : data?.error) ??
    data?.data?.error?.code;

  return typeof errorCode === 'string' ? errorCode : undefined;
}

export function isTikTokAuthorizationError(error: unknown): boolean {
  return [
    'access_token_invalid',
    'invalid_grant',
    'invalid_refresh_token',
    'refresh_token_expired',
    'token_expired',
  ].includes(getTikTokErrorCode(error) ?? '');
}

export function isTikTokScopeError(error: unknown): boolean {
  return ['invalid_scope', 'scope_not_authorized'].includes(
    getTikTokErrorCode(error) ?? '',
  );
}

export function isTikTokRateLimitError(error: unknown): boolean {
  const axiosError = error as AxiosError<TikTokErrorPayload>;
  return (
    axiosError.response?.status === 429 ||
    getTikTokErrorCode(error) === 'rate_limit_exceeded'
  );
}

export function getTikTokRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as AxiosError<TikTokErrorPayload>;
  const retryAfter = axiosError.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}
