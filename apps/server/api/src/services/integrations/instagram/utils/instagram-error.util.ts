import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import type { AxiosError } from 'axios';

interface InstagramGraphErrorBody {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
}

interface InstagramErrorPayload {
  error?: InstagramGraphErrorBody | string;
}

const AUTHORIZATION_CODES = new Set([190, 102]);
const SCOPE_CODES = new Set([10, 200, 294]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const PROFESSIONAL_ACCOUNT_PATTERN =
  /professional account|instagram professional|business account required|creator account|a professional instagram/i;

export function parseInstagramGrantedScopes(value: unknown): string[] {
  return parseGrantedOAuthScopes(value);
}

export function getInstagramGraphError(
  error: unknown,
): InstagramGraphErrorBody | undefined {
  const axiosError = error as
    | AxiosError<InstagramErrorPayload>
    | null
    | undefined;
  const data = axiosError?.response?.data;
  const graphError = data?.error;

  if (!graphError || typeof graphError === 'string') {
    return undefined;
  }

  return graphError;
}

export function getInstagramErrorCode(error: unknown): number | undefined {
  const code = getInstagramGraphError(error)?.code;
  return typeof code === 'number' && Number.isFinite(code) ? code : undefined;
}

export function isInstagramAuthorizationError(error: unknown): boolean {
  const code = getInstagramErrorCode(error);
  return code !== undefined && AUTHORIZATION_CODES.has(code);
}

export function isInstagramScopeError(error: unknown): boolean {
  if (isInstagramProfessionalAccountError(error)) {
    return false;
  }

  const code = getInstagramErrorCode(error);
  if (code !== undefined && SCOPE_CODES.has(code)) {
    return true;
  }

  const message = getInstagramGraphError(error)?.message?.toLowerCase() ?? '';
  return message.includes('permission') || message.includes('(#10)');
}

export function isInstagramProfessionalAccountError(error: unknown): boolean {
  const message = getInstagramGraphError(error)?.message ?? '';
  return PROFESSIONAL_ACCOUNT_PATTERN.test(message);
}

export function isInstagramRateLimitError(error: unknown): boolean {
  const axiosError = error as
    | AxiosError<InstagramErrorPayload>
    | null
    | undefined;
  const code = getInstagramErrorCode(error);
  return (
    axiosError?.response?.status === 429 ||
    (code !== undefined && RATE_LIMIT_CODES.has(code))
  );
}

export function getInstagramRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as
    | AxiosError<InstagramErrorPayload>
    | null
    | undefined;
  const retryAfter = axiosError?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}
