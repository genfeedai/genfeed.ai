import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import type { AxiosError } from 'axios';

interface YoutubeErrorDetail {
  domain?: string;
  message?: string;
  reason?: string;
}

interface YoutubeApiErrorBody {
  code?: number;
  errors?: YoutubeErrorDetail[];
  message?: string;
  status?: string;
}

interface YoutubeErrorPayload {
  error?: YoutubeApiErrorBody | string;
  error_description?: string;
}

const AUTHORIZATION_REASONS = new Set([
  'authError',
  'invalidCredentials',
  'unauthorized',
  'invalid_grant',
]);
const SCOPE_REASONS = new Set([
  'insufficientPermissions',
  'forbidden',
  'accessNotConfigured',
]);
const RATE_LIMIT_REASONS = new Set([
  'quotaExceeded',
  'dailyLimitExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
]);
const CHANNEL_SELECTION_PATTERN =
  /channel.*select|brand account|youtubeSignupRequired|no channel|multiple channels/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseYoutubeGrantedScopes(value: unknown): string[] {
  return parseGrantedOAuthScopes(value);
}

export function getYoutubeApiError(
  error: unknown,
): YoutubeApiErrorBody | undefined {
  const axiosError = error as
    | AxiosError<YoutubeErrorPayload>
    | null
    | undefined;
  const data = axiosError?.response?.data;
  const apiError = data?.error;

  if (!apiError || typeof apiError === 'string') {
    if (typeof data?.error === 'string') {
      return {
        message: data.error_description ?? data.error,
        status: data.error,
      };
    }
    if (isRecord(error) && typeof error.message === 'string') {
      return { message: error.message };
    }
    return undefined;
  }

  return apiError;
}

export function getYoutubeErrorCode(error: unknown): number | undefined {
  const axiosError = error as
    | AxiosError<YoutubeErrorPayload>
    | null
    | undefined;
  const code = getYoutubeApiError(error)?.code;
  if (typeof code === 'number' && Number.isFinite(code)) {
    return code;
  }

  const status = axiosError?.response?.status;
  return typeof status === 'number' && Number.isFinite(status)
    ? status
    : undefined;
}

function getYoutubeErrorReasons(error: unknown): string[] {
  const apiError = getYoutubeApiError(error);
  const reasons = (apiError?.errors ?? [])
    .map((item) => item.reason)
    .filter((reason): reason is string => typeof reason === 'string');
  if (typeof apiError?.status === 'string') {
    reasons.push(apiError.status);
  }
  return reasons;
}

function getYoutubeErrorMessage(error: unknown): string {
  const apiError = getYoutubeApiError(error);
  const detailMessages = (apiError?.errors ?? [])
    .map((item) => item.message)
    .filter((message): message is string => typeof message === 'string');
  return [apiError?.message, ...detailMessages].filter(Boolean).join(' ');
}

export function isYoutubeAuthorizationError(error: unknown): boolean {
  const code = getYoutubeErrorCode(error);
  if (code === 401) {
    return true;
  }

  return getYoutubeErrorReasons(error).some((reason) =>
    AUTHORIZATION_REASONS.has(reason),
  );
}

export function isYoutubeChannelSelectionError(error: unknown): boolean {
  const message = getYoutubeErrorMessage(error);
  const reasons = getYoutubeErrorReasons(error);
  return (
    CHANNEL_SELECTION_PATTERN.test(message) ||
    reasons.includes('youtubeSignupRequired')
  );
}

export function isYoutubeScopeError(error: unknown): boolean {
  if (isYoutubeChannelSelectionError(error)) {
    return false;
  }

  const code = getYoutubeErrorCode(error);
  if (code === 403) {
    const reasons = getYoutubeErrorReasons(error);
    if (reasons.some((reason) => RATE_LIMIT_REASONS.has(reason))) {
      return false;
    }
    if (reasons.some((reason) => SCOPE_REASONS.has(reason))) {
      return true;
    }
    const message = getYoutubeErrorMessage(error).toLowerCase();
    return (
      message.includes('permission') ||
      message.includes('insufficient') ||
      message.includes('scope')
    );
  }

  const message = getYoutubeErrorMessage(error).toLowerCase();
  return message.includes('insufficient permissions');
}

export function isYoutubeRateLimitError(error: unknown): boolean {
  const axiosError = error as
    | AxiosError<YoutubeErrorPayload>
    | null
    | undefined;
  const code = getYoutubeErrorCode(error);
  const reasons = getYoutubeErrorReasons(error);
  return (
    axiosError?.response?.status === 429 ||
    code === 429 ||
    reasons.some((reason) => RATE_LIMIT_REASONS.has(reason))
  );
}

export function getYoutubeRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as
    | AxiosError<YoutubeErrorPayload>
    | null
    | undefined;
  const retryAfter = axiosError?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}
