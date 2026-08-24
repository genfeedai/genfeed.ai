import { parseGrantedOAuthScopes } from '@genfeedai/helpers';
import type { AxiosError } from 'axios';

interface LinkedInApiErrorBody {
  code?: number | string;
  message?: string;
  serviceErrorCode?: number;
  status?: number | string;
}

interface LinkedInErrorPayload {
  error?: LinkedInApiErrorBody | string;
  error_description?: string;
  message?: string;
  serviceErrorCode?: number;
  status?: number | string;
}

const AUTHORIZATION_CODES = new Set([
  'invalid_token',
  'unauthorized',
  'revoked_token',
  'expired_token',
]);
const SCOPE_CODES = new Set([
  'access_denied',
  'insufficient_scope',
  'forbidden',
  'not_enough_permissions',
]);
const ORGANIZATION_SELECTION_PATTERN =
  /organization.*(select|acl|admin)|no organization|company page/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseLinkedinGrantedScopes(value: unknown): string[] {
  return parseGrantedOAuthScopes(value);
}

export function getLinkedinApiError(
  error: unknown,
): LinkedInApiErrorBody | undefined {
  const axiosError = error as
    | AxiosError<LinkedInErrorPayload>
    | null
    | undefined;
  const data = axiosError?.response?.data;

  if (isRecord(data)) {
    if (typeof data.error === 'string') {
      return {
        message: readString(data.error_description) ?? data.error,
        status: data.error,
      };
    }
    if (isRecord(data.error)) {
      return {
        code: readCode(data.error.code) ?? readCode(data.serviceErrorCode),
        message: readString(data.error.message) ?? readString(data.message),
        serviceErrorCode: readFiniteNumber(data.serviceErrorCode),
        status: readCode(data.error.status) ?? readCode(data.status),
      };
    }
    if (
      typeof data.message === 'string' ||
      data.serviceErrorCode !== undefined ||
      data.status !== undefined
    ) {
      return {
        code: readCode(data.serviceErrorCode) ?? readCode(data.status),
        message: readString(data.message),
        serviceErrorCode: readFiniteNumber(data.serviceErrorCode),
        status: readCode(data.status),
      };
    }
  }

  if (isRecord(error) && typeof error.message === 'string') {
    return { message: error.message };
  }

  return undefined;
}

export function getLinkedinErrorCode(error: unknown): number | undefined {
  const axiosError = error as
    | AxiosError<LinkedInErrorPayload>
    | null
    | undefined;
  const apiError = getLinkedinApiError(error);
  const code =
    readFiniteNumber(apiError?.code) ?? readFiniteNumber(apiError?.status);
  if (code !== undefined) {
    return code;
  }

  const status = axiosError?.response?.status;
  return typeof status === 'number' && Number.isFinite(status)
    ? status
    : undefined;
}

function getLinkedinErrorLabels(error: unknown): string[] {
  const apiError = getLinkedinApiError(error);
  return [apiError?.status, apiError?.code, apiError?.message]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .filter((value) => value.length > 0);
}

function getLinkedinErrorMessage(error: unknown): string {
  return getLinkedinApiError(error)?.message ?? '';
}

export function isLinkedinAuthorizationError(error: unknown): boolean {
  const code = getLinkedinErrorCode(error);
  if (code === 401) {
    return true;
  }

  return getLinkedinErrorLabels(error).some((label) =>
    [...AUTHORIZATION_CODES].some((token) => label.includes(token)),
  );
}

export function isLinkedinOrganizationSelectionError(error: unknown): boolean {
  return ORGANIZATION_SELECTION_PATTERN.test(getLinkedinErrorMessage(error));
}

export function isLinkedinScopeError(error: unknown): boolean {
  if (isLinkedinOrganizationSelectionError(error)) {
    return false;
  }

  const code = getLinkedinErrorCode(error);
  if (code === 403) {
    const message = getLinkedinErrorMessage(error).toLowerCase();
    return (
      SCOPE_CODES.has(message) ||
      message.includes('permission') ||
      message.includes('scope') ||
      message.includes('access denied') ||
      message.includes('not enough permissions')
    );
  }

  return getLinkedinErrorLabels(error).some((label) =>
    [...SCOPE_CODES].some((token) => label.includes(token)),
  );
}

export function isLinkedinRateLimitError(error: unknown): boolean {
  const axiosError = error as
    | AxiosError<LinkedInErrorPayload>
    | null
    | undefined;
  const code = getLinkedinErrorCode(error);
  const message = getLinkedinErrorMessage(error).toLowerCase();
  return (
    axiosError?.response?.status === 429 ||
    code === 429 ||
    message.includes('throttle') ||
    message.includes('rate limit')
  );
}

export function getLinkedinRetryAfterMs(
  error: unknown,
  fallbackMs: number,
  maximumMs: number,
): number {
  const axiosError = error as
    | AxiosError<LinkedInErrorPayload>
    | null
    | undefined;
  const retryAfter = axiosError?.response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfter);

  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds < 0) {
    return fallbackMs;
  }

  return Math.min(retryAfterSeconds * 1_000, maximumMs);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readCode(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return readString(value);
}
